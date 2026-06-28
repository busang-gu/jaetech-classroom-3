// 트레이닝 — GET: 현황표 / POST: 본인 선호 시간 변경
import { requireSession } from './_lib/session.js';
import { getSupabase } from './_lib/supabase.js';

const ALLOWED_PREF = ['weekend', 'weekday', null];

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  // ===== POST — 본인 선호 시간 업데이트 =====
  if (req.method === 'POST') {
    const { preference } = req.body || {};
    const value = preference === '' ? null : preference;
    if (!ALLOWED_PREF.includes(value)) {
      return res.status(400).json({ error: 'invalid_preference' });
    }
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('users')
        .update({ training_preference: value })
        .eq('id', session.userId)
        .select('id, training_preference')
        .single();
      if (error) throw error;
      return res.status(200).json({ preference: data.training_preference });
    } catch (e) {
      console.error('training POST error', e);
      return res.status(500).json({ error: e.message || 'server_error' });
    }
  }

  // ===== GET — 전체 현황표 =====
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('id, kakao_id, nickname, is_admin, training_status, training_preference, created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const students = (data || []).filter(u => !u.is_admin).map(u => ({
      id: u.id,
      kakao_id: u.kakao_id,
      nickname: u.nickname,
      training_status: u.training_status || 'pending',
      training_preference: u.training_preference || null,
    }));

    const summary = {
      total: students.length,
      completed: students.filter(s => s.training_status === 'completed').length,
      scheduled: students.filter(s => s.training_status === 'scheduled').length,
      pending: students.filter(s => s.training_status === 'pending').length,
    };

    return res.status(200).json({ summary, students });
  } catch (e) {
    console.error('training GET error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}
