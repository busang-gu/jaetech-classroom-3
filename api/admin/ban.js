// 관리자: 수강생 강퇴 / 강퇴 해제
// POST { student_id, banned: true|false, reason?: string }
import { requireAdmin } from '../_lib/session.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { student_id, banned, reason } = req.body || {};
  if (!student_id || typeof banned !== 'boolean') {
    return res.status(400).json({ error: 'invalid_params' });
  }

  try {
    const supabase = getSupabase();

    // 자기 자신 강퇴 방지
    if (student_id === session.userId) {
      return res.status(400).json({ error: 'cannot_ban_self' });
    }

    // 다른 관리자 강퇴 방지
    const { data: target } = await supabase
      .from('users')
      .select('id, is_admin')
      .eq('id', student_id)
      .maybeSingle();
    if (!target) return res.status(404).json({ error: 'not_found' });
    if (target.is_admin) return res.status(400).json({ error: 'cannot_ban_admin' });

    const now = new Date().toISOString();
    const payload = banned
      ? {
          is_banned: true,
          banned_at: now,
          banned_reason: (reason || '').toString().slice(0, 500),
          banned_by: session.userId,
        }
      : {
          is_banned: false,
          banned_at: null,
          banned_reason: null,
          banned_by: null,
        };

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', student_id)
      .select('id, nickname, is_banned, banned_at, banned_reason')
      .single();

    if (error) throw error;
    return res.status(200).json({ student: data });
  } catch (e) {
    console.error('admin ban error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}
