// 본인 과제 CRUD — 로그인 사용자 전용
import { requireSession } from './_lib/session.js';
import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return listAssignments(req, res, session);
  if (req.method === 'POST') return upsertAssignment(req, res, session);
  return res.status(405).json({ error: 'method_not_allowed' });
}

async function listAssignments(req, res, session) {
  const week = req.query.week ? parseInt(req.query.week, 10) : null;
  const supabase = getSupabase();

  let q = supabase
    .from('assignments')
    .select('*, assignment_images(id, storage_path, order_idx)')
    .eq('user_id', session.userId)
    .order('week', { ascending: true });

  if (week) q = q.eq('week', week);

  const { data, error } = await q;
  if (error) {
    console.error('list assignments error', error);
    return res.status(500).json({ error: error.message });
  }

  // 이미지에 signed URL 부여 (1시간 유효)
  for (const a of data || []) {
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

  return res.status(200).json({ assignments: data || [] });
}

async function upsertAssignment(req, res, session) {
  const body = req.body || {};
  const week = parseInt(body.week, 10);
  const status = body.status;

  if (!Number.isInteger(week) || week < 1 || week > 4) {
    return res.status(400).json({ error: 'invalid_week' });
  }
  if (!['draft', 'submitted'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }

  const supabase = getSupabase();

  // 기존 행 조회 (제출 후 다시 임시저장으로 못 돌아가게)
  const { data: existing } = await supabase
    .from('assignments')
    .select('id, status, submitted_at')
    .eq('user_id', session.userId)
    .eq('week', week)
    .maybeSingle();

  const payload = {
    user_id: session.userId,
    week,
    status,
    form_data: body.form_data || {},
    proof_text: typeof body.proof_text === 'string' ? body.proof_text : '',
    submitted_at:
      status === 'submitted'
        ? existing?.submitted_at || new Date().toISOString()
        : null,
  };

  const { data, error } = await supabase
    .from('assignments')
    .upsert(payload, { onConflict: 'user_id,week' })
    .select()
    .single();

  if (error) {
    console.error('upsert assignment error', error);
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ assignment: data });
}
