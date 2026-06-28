// 관리자: 수강생 메모 작성/수정/삭제
// POST {student_id, content}        → 새 메모
// PUT {id, content}                  → 수정
// DELETE ?id=xxx                     → 삭제
import { requireAdmin } from '../_lib/session.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') return createNote(req, res, session);
  if (req.method === 'PUT') return updateNote(req, res, session);
  if (req.method === 'DELETE') return deleteNote(req, res, session);
  return res.status(405).json({ error: 'method_not_allowed' });
}

async function createNote(req, res, session) {
  const { student_id, content } = req.body || {};
  if (!student_id || typeof content !== 'string') {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('admin_notes')
    .insert({
      student_id,
      author_id: session.userId,
      content,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ note: data });
}

async function updateNote(req, res, session) {
  const { id, content } = req.body || {};
  if (!id || typeof content !== 'string') {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('admin_notes')
    .update({ content })
    .eq('id', id)
    .eq('author_id', session.userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ note: data });
}

async function deleteNote(req, res, session) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'missing_id' });

  const supabase = getSupabase();
  const { error } = await supabase
    .from('admin_notes')
    .delete()
    .eq('id', id)
    .eq('author_id', session.userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}
