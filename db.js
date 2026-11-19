// Lapisan database SUPABASE (Postgres + Storage). Antarmukanya sama dengan versi lokal.
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = ({ data, error }) => { if (error) throw error; return data; };
module.exports = {
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
