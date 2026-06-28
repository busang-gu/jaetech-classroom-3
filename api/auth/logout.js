// 로그아웃 — 세션 쿠키 제거
export default function handler(req, res) {
  res.setHeader(
    'Set-Cookie',
    'jl_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
  );
  res.redirect(302, '/login.html');
}
