// 본인 트레이닝 선호 시간대 변경 (학생 본인)
// POST { preference: 'weekend' | 'weekday' | null }
import { requireSession } from './_lib/session.js';
import { getSupabase } from './_lib/supabase.js';

const ALLOWED = ['weekend', 'weekday', null];

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { preference } = req.body || {};
  const value = preference === '' ? null : preference;
  if (!ALLOWED.includes(value)) {
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
    console.error('training-preference error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}
