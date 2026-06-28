// 카카오 OAuth 콜백 — 토큰 발급 → 사용자 정보 조회 → Supabase upsert → JWT 쿠키
import { SignJWT } from 'jose';
import { getSupabase } from '../_lib/supabase.js';

const COOKIE_NAME = 'jl_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14일

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(302, '/login.html?err=' + encodeURIComponent(error));
  }
  if (!code) {
    return res.redirect(302, '/login.html?err=no_code');
  }

  const clientId = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET; // optional
  const jwtSecret = process.env.JWT_SECRET;
  const adminIds = (process.env.ADMIN_KAKAO_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!clientId || !jwtSecret) {
    console.error('callback: server env not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/auth/callback`;

  try {
    // 1) 카카오 토큰 발급
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: String(code),
    });
    if (clientSecret) tokenParams.set('client_secret', clientSecret);

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: tokenParams.toString(),
    });
    if (!tokenRes.ok) {
      console.error('kakao token error', await tokenRes.text());
      return res.redirect(302, '/login.html?err=token_failed');
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2) 카카오 사용자 정보 조회
    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      console.error('kakao user error', await userRes.text());
      return res.redirect(302, '/login.html?err=user_failed');
    }
    const kakaoUser = await userRes.json();
    const kakaoId = String(kakaoUser.id);
    const nickname = kakaoUser.properties?.nickname
      || kakaoUser.kakao_account?.profile?.nickname
      || '수강생';

    const isAdmin = adminIds.includes(kakaoId);

    // 3) Supabase users 테이블에 upsert
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data: user, error: upsertErr } = await supabase
      .from('users')
      .upsert(
        {
          kakao_id: kakaoId,
          nickname,
          is_admin: isAdmin,
          last_login_at: now,
        },
        { onConflict: 'kakao_id', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (upsertErr || !user) {
      console.error('supabase upsert error', upsertErr);
      return res.redirect(302, '/login.html?err=db_error');
    }

    // 3-1) 강퇴 사용자 차단 — 쿠키 발급 없이 안내 페이지로
    if (user.is_banned) {
      const r = user.banned_reason ? '?reason=' + encodeURIComponent(user.banned_reason) : '';
      return res.redirect(302, '/banned.html' + r);
    }

    // 4) JWT 발급 (userId 포함)
    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      userId: user.id,
      kakaoId,
      nickname: user.nickname,
      isAdmin: user.is_admin,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${COOKIE_MAX_AGE}s`)
      .sign(secret);

    // 5) 쿠키 세팅
    const cookie = [
      `${COOKIE_NAME}=${token}`,
      'Path=/',
      `Max-Age=${COOKIE_MAX_AGE}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ].join('; ');
    res.setHeader('Set-Cookie', cookie);

    // 6) returnTo 복원
    let returnTo = '/';
    try {
      const decoded = JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8'));
      if (decoded?.r && decoded.r.startsWith('/')) returnTo = decoded.r;
    } catch {}

    return res.redirect(302, returnTo);
  } catch (e) {
    console.error('callback error', e);
    return res.redirect(302, '/login.html?err=server_error');
  }
}
