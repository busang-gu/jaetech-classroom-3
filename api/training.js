// 트레이닝 현황표 — 모든 수강생이 조회 가능
import { requireSession } from './_lib/session.js';
import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('id, kakao_id, nickname, is_admin, training_status, created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 관리자 제외, 수강생만
    const students = (data || []).filter(u => !u.is_admin).map(u => ({
      id: u.id,
      kakao_id: u.kakao_id,
      nickname: u.nickname,
      training_status: u.training_status || 'pending',
    }));

    // 집계
    const summary = {
      total: students.length,
      completed: students.filter(s => s.training_status === 'completed').length,
      scheduled: students.filter(s => s.training_status === 'scheduled').length,
      pending: students.filter(s => s.training_status === 'pending').length,
    };

    return res.status(200).json({ summary, students });
  } catch (e) {
    console.error('training error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}
