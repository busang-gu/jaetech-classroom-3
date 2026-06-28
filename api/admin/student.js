// 관리자: 특정 수강생 상세 (제출물 + 메모)
// GET ?id=xxx
import { requireAdmin } from '../_lib/session.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'missing_id' });

  try {
    const supabase = getSupabase();

    const { data: student, error: uErr } = await supabase
      .from('users')
      .select('id, kakao_id, nickname, is_admin, is_banned, banned_at, banned_reason, last_login_at, created_at')
      .eq('id', id)
      .maybeSingle();

    if (uErr || !student) {
      return res.status(404).json({ error: 'not_found' });
    }

    const { data: assignments, error: aErr } = await supabase
      .from('assignments')
      .select('*, assignment_images(id, storage_path, order_idx)')
      .eq('user_id', id)
      .order('week', { ascending: true });

    if (aErr) throw aErr;

    // 이미지 signed URL
    for (const a of assignments || []) {
      if (a.assignment_images?.length) {
        a.assignment_images.sort((x, y) => x.order_idx - y.order_idx);
        for (const img of a.assignment_images) {
          const { data: signed } = await supabase.storage
            .from('assignment-images')
            .createSignedUrl(img.storage_path, 60 * 60);
          img.url = signed?.signedUrl || null;
        }
      }
    }

    // 관리자 메모
    const { data: notes, error: nErr } = await supabase
      .from('admin_notes')
      .select('id, content, author_id, updated_at, created_at, author:users!admin_notes_author_id_fkey(nickname)')
      .eq('student_id', id)
      .order('updated_at', { ascending: false });

    if (nErr) console.warn('notes warn', nErr);

    return res.status(200).json({
      student,
      assignments: assignments || [],
      notes: notes || [],
    });
  } catch (e) {
    console.error('admin student error', e);
    return res.status(500).json({ error: e.message || 'server_error' });
  }
}
