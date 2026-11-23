// Lapisan database SUPABASE (Postgres + Storage). Antarmukanya sama dengan versi lokal.
const { createClient } = require('@supabase/supabase-js');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) throw new Error('KONFIGURASI BELUM LENGKAP: isi SUPABASE_URL dan SUPABASE_SERVICE_KEY di Environment Variables (Vercel > Settings > Environment Variables), lalu Redeploy.');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = ({ data, error }) => { if (error) throw error; return data; };
// Terjemahan galat Supabase yang umum menjadi saran perbaikan (ditampilkan di terminal/Logs)
const explain = e => {
  const m = String((e && e.message) || e || ''), c = e && e.code;
  if (c === '42501' || /permission denied/i.test(m)) return 'Supabase menolak akses tabel (permission denied). Jalankan ulang file supabase.sql di Supabase > SQL Editor: bagian "GRANT ... TO service_role" wajib ada pada project Supabase baru.';
  if (c === 'PGRST205' || c === '42P01' || /schema cache|does not exist/i.test(m)) return 'Tabel belum ada di database. Jalankan file supabase.sql di Supabase > SQL Editor.';
  if (/invalid api key|invalid jwt|jwt|apikey/i.test(m)) return 'SUPABASE_SERVICE_KEY tidak valid. Pakai Secret key (sb_secret_...) dari Project Settings > API Keys, dan pastikan SUPABASE_URL berasal dari project yang sama.';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(m)) return 'Tidak dapat menghubungi Supabase. Periksa SUPABASE_URL (bentuk https://xxxx.supabase.co) dan koneksi internet.';
  return null;
};
const PN = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf|docx)$/; // pola nama file privat (UUID + ekstensi)
module.exports = {
  explain,
  async list(t, o = {}) {
    let x = sb.from(t).select('*');
    for (const [k, v] of Object.entries(o.where || {})) x = x.eq(k, v);
    for (const [k, v] of Object.entries(o.neq || {})) x = x.neq(k, v);
    if (o.order) { x = x.order(o.order[0], { ascending: o.order[1] }); if (o.order[0] !== 'id') x = x.order('id', { ascending: o.order[1] }); }
    if (o.limit) x = x.limit(o.limit);
    return ok(await x) || [];
  },
  async get(t, id) { return ok(await sb.from(t).select('*').eq('id', id).maybeSingle()); },
  async insert(t, row) { ok(await sb.from(t).insert(row)); },
  async update(t, id, row) { ok(await sb.from(t).update(row).eq('id', id)); },
  // File pendaftar disimpan di bucket PRIVAT "registrations" (tidak punya URL publik). Admin mengunduh lewat tautan bertanda tangan 60 detik.
  async putPrivate(buf, name, type) { if (!PN.test(name)) throw new Error('nama file tidak valid'); const { error } = await sb.storage.from('registrations').upload(name, buf, { contentType: type, upsert: false }); if (error) throw error; },
  async getPrivate(name, as) { if (!PN.test(name)) return null; const { data, error } = await sb.storage.from('registrations').createSignedUrl(name, 60, { download: as || true }); return error || !data ? null : { url: data.signedUrl }; },
  async removePrivate(names) { const l = names.filter(n => PN.test(n)); if (!l.length) return; const { error } = await sb.storage.from('registrations').remove(l); if (error) console.error('[storage] gagal menghapus file:', error.message); },
  async clear(t) { ok(await sb.from(t).delete().gte('id', 0)); },
  async remove(t, id) { ok(await sb.from(t).delete().eq('id', id)); },
  async count(t, where = {}) {
    let x = sb.from(t).select('*', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(where)) x = x.eq(k, v);
    const { count, error } = await x; if (error) throw error; return count || 0;
  },
  async settings() { return ok(await sb.from('settings').select('*')) || []; },
  async saveSettings(rows) { ok(await sb.from('settings').upsert(rows)); },
  async upload(buf, name, type) {
    const { error } = await sb.storage.from('media').upload(name, buf, { contentType: type, upsert: false }); if (error) throw error;
    return sb.storage.from('media').getPublicUrl(name).data.publicUrl;
  },
  async rate(key, max, ms) { // pembatas percobaan, disimpan di tabel rate_limits (dipakai bersama semua instance Vercel)
    try {
      const now = Date.now(), { data } = await sb.from('rate_limits').select('*').eq('key', key).maybeSingle();
      if (!data || new Date(data.reset_at).getTime() < now) { ok(await sb.from('rate_limits').upsert({ key, count: 1, reset_at: new Date(now + ms).toISOString() })); return true; }
      if (data.count >= max) return false;
      ok(await sb.from('rate_limits').update({ count: data.count + 1 }).eq('key', key)); return true;
    } catch (e) { console.error('[rate_limits] gagal, pembatas dilewati:', e.message); return true; }
  }
};
