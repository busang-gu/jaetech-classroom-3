// 과제 첨부 이미지 — Supabase Storage 직접 업로드 흐름
// POST {action:'sign'}     → 클라이언트가 직접 업로드할 signed URL 발급
// POST {action:'register'} → 업로드 완료 후 DB에 등록
// DELETE ?id=xxx           → 이미지 삭제 (Storage + DB)
import { requireSession } from './_lib/session.js';
import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    const action = req.body?.action;
    if (action === 'sign') return signUpload(req, res, session);
    if (action === 'register') return registerImage(req, res, session);
    return res.status(400).json({ error: 'invalid_action' });
  }

  if (req.method === 'DELETE') return deleteImage(req, res, session);

  return res.status(405).json({ error: 'method_not_allowed' });
}

async function assertOwner(supabase, assignmentId, userId) {
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('id', assignmentId)
    .eq('user_id', userId)
    .maybeSingle();
  return !error && !!data;
}

async function signUpload(req, res, session) {
  const { assignment_id, filename } = req.body || {};
  if (!assignment_id) {
    return res.status(400).json({ error: 'missing_assignment_id' });
  }

  const supabase = getSupabase();
  const ok = await assertOwner(supabase, assignment_id, session.userId);
  if (!ok) return res.status(403).json({ error: 'not_owner' });

  const ext = (filename || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || 'png';
  const ts = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const storage_path = `${session.userId}/${assignment_id}/${ts}-${random}.${ext}`;

  const { data, error } = await supabase.storage
    .from('assignment-images')
    .createSignedUploadUrl(storage_path);

  if (error || !data) {
    console.error('sign upload error', error);
    return res.status(500).json({ error: error?.message || 'sign_failed' });
  }

  return res.status(200).json({
    signed_url: data.signedUrl,
    storage_path: storage_path,
    token: data.token,
  });
}

async function registerImage(req, res, session) {
  const { assignment_id, storage_path, order_idx } = req.body || {};
  if (!assignment_id || !storage_path) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const supabase = getSupabase();
  const ok = await assertOwner(supabase, assignment_id, session.userId);
  if (!ok) return res.status(403).json({ error: 'not_owner' });

  // storage_path가 본인 ID로 시작하는지 한번 더 검증 (안전장치)
  if (!storage_path.startsWith(`${session.userId}/`)) {
    return res.status(400).json({ error: 'invalid_path' });
  }

  const { data, error } = await supabase
    .from('assignment_images')
    .insert({
      assignment_id,
      storage_path,
      order_idx: Number.isInteger(order_idx) ? order_idx : 0,
    })
    .select()
    .single();

  if (error) {
    console.error('register image error', error);
    return res.status(500).json({ error: error.message });
  }

  // 이미지 보기용 signed URL 함께 반환
  const { data: signed } = await supabase.storage
    .from('assignment-images')
    .createSignedUrl(storage_path, 60 * 60);

  return res.status(200).json({
    image: { ...data, url: signed?.signedUrl || null },
  });
}

async function deleteImage(req, res, session) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'missing_id' });

  const supabase = getSupabase();

  // 본인 이미지인지 확인 — assignments.user_id로
  const { data, error } = await supabase
    .from('assignment_images')
    .select('id, storage_path, assignment:assignments!inner(user_id)')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'not_found' });
  if (data.assignment.user_id !== session.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Storage 삭제 (실패해도 DB 삭제는 계속)
  try {
    await supabase.storage.from('assignment-images').remove([data.storage_path]);
  } catch (e) {
    console.warn('storage remove warn', e);
  }

  const { error: delErr } = await supabase
    .from('assignment_images')
    .delete()
    .eq('id', id);

  if (delErr) {
    console.error('delete image error', delErr);
    return res.status(500).json({ error: delErr.message });
  }

  return res.status(200).json({ success: true });
}
