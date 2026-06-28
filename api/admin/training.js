// 관리자: 특정 수강생 트레이닝 상태 변경
// POST { student_id, status }   status: 'pending' | 'scheduled' | 'completed'
import { requireAdmin } from '../_lib/session.js';
import { getSupabase } from '../_lib/supabase.js';

const ALLOWED = ['pending', 'scheduled', 'completed'];

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { student_id, status } = req.body || {};
  if (!student_id || !ALLOWED.includes(status)) {
    return res.status(400).json({ error: 'invalid_params' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('users')
      .update({ training_status: status })
      .eq('id', student_id)
      .select('id, nickname, training_status')
      .single();

    if (error) throw error;
    return res.status(200).json({ student: data });
  } catch (e) {
    console.error('admin training error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}
