// 세션 헬퍼 — 쿠키 파싱 + JWT 검증 + DB ban 게이트
import { jwtVerify } from 'jose';
import { getSupabase } from './supabase.js';

export const COOKIE_NAME = 'jl_session';

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

// 요청에서 세션 페이로드 추출 — 무효하면 null
export async function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET not set');

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId,
      kakaoId: payload.kakaoId,
      nickname: payload.nickname,
      isAdmin: !!payload.isAdmin,
    };
  } catch {
    return null;
  }
}

// 강퇴된 사용자 확인 — banned면 { banned: true, reason }
export async function checkBanned(userId) {
  if (!userId) return { banned: false };
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('users')
      .select('is_banned, banned_reason')
      .eq('id', userId)
      .maybeSingle();
    if (data && data.is_banned) {
      return { banned: true, reason: data.banned_reason || '' };
    }
    return { banned: false };
  } catch {
    return { banned: false };
  }
}

// 강퇴 사용자 차단용 쿠키 만료 헤더
function expireSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  );
}

// 인증 필수 — 무효면 401 응답 후 null 반환
export async function requireSession(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
  // 강퇴 체크 (관리자는 어차피 banned 될 일 없지만 일관성 위해)
  const ban = await checkBanned(session.userId);
  if (ban.banned) {
    expireSessionCookie(res);
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({ error: 'banned', reason: ban.reason });
    return null;
  }
  return session;
}

// 관리자 필수
export async function requireAdmin(req, res) {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (!session.isAdmin) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return session;
}
