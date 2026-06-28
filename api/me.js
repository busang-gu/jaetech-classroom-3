// 현재 로그인 사용자 정보 — 인증 게이트가 호출
import { getSession, COOKIE_NAME } from './_lib/session.js';
import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'no_session' });
  }

  // DB에서 최신 정보 조회 (is_admin / is_banned 갱신 반영)
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('id, kakao_id, nickname, is_admin, is_banned, banned_reason, banned_at, training_preference')
      .eq('id', session.userId)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'user_not_found' });
    }

    if (data.is_banned) {
      // 쿠키 만료
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
      );
      return res.status(200).json({
        banned: true,
        reason: data.banned_reason || '',
        bannedAt: data.banned_at || null,
        nickname: data.nickname,
      });
    }

    return res.status(200).json({
      userId: data.id,
      kakaoId: data.kakao_id,
      nickname: data.nickname,
      isAdmin: data.is_admin,
      trainingPreference: data.training_preference || null,
    });
  } catch (e) {
    console.error('me error', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
