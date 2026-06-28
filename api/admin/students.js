// 관리자: 전체 수강생 명단 + 주차별 제출 상태 집계
import { requireAdmin } from '../_lib/session.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const supabase = getSupabase();

    // 모든 사용자 + 그들의 assignments 일괄 조회
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, kakao_id, nickname, is_admin, is_banned, banned_at, last_login_at, created_at')
      .order('created_at', { ascending: true });
    if (uErr) throw uErr;

    const { data: assignments, error: aErr } = await supabase
      .from('assignments')
      .select('user_id, week, status, submitted_at, updated_at');
    if (aErr) throw aErr;

    // 사용자별 진도 집계
    const byUser = new Map();
    for (const a of assignments || []) {
      if (!byUser.has(a.user_id)) byUser.set(a.user_id, {});
      byUser.get(a.user_id)[a.week] = a;
    }

    const students = (users || [])
      .filter(u => !u.is_admin) // 관리자 본인은 명단에서 제외
      .map(u => {
        const w = byUser.get(u.id) || {};
        const submittedWeeks = [1, 2, 3, 4].filter(
          n => w[n]?.status === 'submitted'
        ).length;
        const status = computeStatus(w);
        return {
          id: u.id,
          kakao_id: u.kakao_id,
          nickname: u.nickname,
          is_banned: !!u.is_banned,
          banned_at: u.banned_at || null,
          last_login_at: u.last_login_at,
          created_at: u.created_at,
          weeks: w,
          submitted_count: submittedWeeks,
          progress_pct: Math.round((submittedWeeks / 4) * 100),
          status,
        };
      });

    // 요약 통계
    const totalCount = students.length;
    const summary = {
      total: totalCount,
      week_submitted: {
        1: students.filter(s => s.weeks[1]?.status === 'submitted').length,
        2: students.filter(s => s.weeks[2]?.status === 'submitted').length,
        3: students.filter(s => s.weeks[3]?.status === 'submitted').length,
        4: students.filter(s => s.weeks[4]?.status === 'submitted').length,
      },
      at_risk: students.filter(s => s.status === 'at-risk').length,
      late: students.filter(s => s.status === 'late').length,
      on_track: students.filter(s => s.status === 'on-track').length,
      completed: students.filter(s => s.status === 'completed').length,
    };

    return res.status(200).json({ summary, students });
  } catch (e) {
    console.error('admin students error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}

function computeStatus(weeks) {
  const submitted = [1, 2, 3, 4].filter(n => weeks[n]?.status === 'submitted').length;
  if (submitted === 4) return 'completed';

  // 강퇴 후보: 1주차 미제출 (개강일 + 6일 이후)
  const w1 = weeks[1];
  if (!w1 || w1.status !== 'submitted') return 'late';

  // at-risk: 직전 주차 미제출
  if (weeks[2] && weeks[2].status !== 'submitted') return 'at-risk';
  return 'on-track';
}
