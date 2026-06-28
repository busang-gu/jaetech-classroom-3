// 카카오 로그인 시작 — 카카오 OAuth 인가 페이지로 리다이렉트
export default function handler(req, res) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) {
    return res.status(500).json({ error: 'KAKAO_REST_API_KEY not set' });
  }

  // 콜백 URL — 배포 환경에 맞춰 자동 결정
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/auth/callback`;

  // 어디로 돌아갈지 (?return=/assignments.html 같이)
  const returnTo = (req.query.return || '/').toString();

  // state로 returnTo 전달 (CSRF 방지 토큰도 같이 박을 수 있지만 일단 단순)
  const state = Buffer.from(JSON.stringify({ r: returnTo })).toString('base64url');

  const authUrl = new URL('https://kauth.kakao.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'profile_nickname');

  res.redirect(302, authUrl.toString());
}
