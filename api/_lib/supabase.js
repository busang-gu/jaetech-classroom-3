// Supabase 클라이언트 — Vercel API Routes에서만 사용 (service key 비밀)
import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabase() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY env not set');
  }

  _client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
