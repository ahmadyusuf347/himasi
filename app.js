require('dotenv').config();
const express = require('express'), path = require('path'), crypto = require('crypto'), cookie = require('cookie-parser');
const jwt = require('jsonwebtoken'), multer = require('multer'), helmet = require('helmet'), db = require('./db'), CONFIG = require('./config');

// ---------- Konfigurasi & pemeriksaan keamanan awal ----------
const PROD = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
const ADMIN_USER = process.env.ADMIN_USER || (PROD ? '' : 'admin');
const ADMIN_PASS = process.env.ADMIN_PASS || (PROD ? '' : 'admin123');
const SECRET = process.env.JWT_SECRET || (PROD ? '' : crypto.randomBytes(32).toString('hex'));
if (PROD && (!ADMIN_USER || ADMIN_PASS.length < 10 || SECRET.length < 24))
  throw new Error('KONFIGURASI TIDAK AMAN: isi ADMIN_USER, ADMIN_PASS (min. 10 karakter) dan JWT_SECRET (min. 24 karakter) di Environment Variables.');
if (!PROD && ADMIN_PASS === 'admin123') console.warn('[PERINGATAN] Password admin masih default. Ubah di file .env.');

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const safeUrl = u => { u = String(u || '').trim(); return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(u) ? u : '#'; };
const bad = (m, status = 400) => Object.assign(new Error(m), { safe: true, status });
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;

const app = express();
app.set('trust proxy', PROD ? 1 : false); app.disable('x-powered-by');
app.set('view engine', 'ejs'); app.set('views', path.join(__dirname, 'views'));
let sbOrigin = null; try { sbOrigin = new URL(process.env.SUPABASE_URL).origin; } catch {}
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:', ...(sbOrigin ? [sbOrigin] : [])], connectSrc: ["'self'"],
    objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], ...(PROD ? { upgradeInsecureRequests: [] } : {})
  } },
  crossOriginEmbedderPolicy: false
}));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', setHeaders: (res, f) => {
  if (f.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
  if (f.includes(path.sep + 'uploads' + path.sep)) res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
} }));
app.use(express.urlencoded({ extended: true, limit: '100kb' })); app.use(cookie());
app.param('id', (q, r, n, v) => /^\d{1,12}$/.test(v) ? n() : r.status(404).send('Tidak ditemukan'));
const w = fn => (q, s, n) => Promise.resolve(fn(q, s, n)).catch(n);

// ---------- Upload aman (whitelist ekstensi + cek isi file) ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 30, fields: 120 } });
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon', pdf: 'application/pdf', zip: 'application/zip' };
const IMG = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico']);
function sniff(b, ext) {
  const h = b.subarray(0, 12), is = (...x) => x.every((v, i) => h[i] === v), s = (a, z) => h.toString('latin1', a, z);
  switch (ext) {
    case 'jpg': case 'jpeg': return is(0xFF, 0xD8, 0xFF);
    case 'png': return is(0x89, 0x50, 0x4E, 0x47); case 'gif': return s(0, 4) === 'GIF8';
    case 'webp': return s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP'; case 'pdf': return s(0, 4) === '%PDF';
    case 'avif': return s(4, 8) === 'ftyp' && ['avif', 'avis'].includes(s(8, 12));
    case 'zip': return is(0x50, 0x4B); case 'ico': return is(0, 0, 1, 0);
    case 'svg': { const t = b.toString('utf8', 0, Math.min(b.length, 300000)); return /<svg[\s>]/i.test(t) && !/<script|\son[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(t); }
  } return false;
}
async function save(f, allowFile) {
  const ext = (f.originalname.split('.').pop() || '').toLowerCase();
  if (!TYPES[ext] || (!IMG.has(ext) && !allowFile)) throw bad('Tipe file tidak diizinkan.');
  if (!sniff(f.buffer, ext)) throw bad('Isi file tidak sesuai ekstensinya atau tidak aman.');
  return db.upload(f.buffer, crypto.randomUUID() + '.' + ext, TYPES[ext]);
}

// ---------- Pengaturan (CMS) ----------
const DEFAULTS = {
  site_name: 'HIMASI', struktur_subtitle: 'Struktur Organisasi HIMA SI Institut Citra Buana Indonesia', color_accent: '#17a672', periode: '2026/2027', home_title2: 'Bersama HIMA SI',
  color_primary: '#0096c7', color_dark: '#003f8c', color_footer: '#212121',
  home_title: 'Mari Berkarya dan Berkolaborasi', home_desc: 'Wadah kreativitas, kolaborasi, dan pengembangan mahasiswa Sistem Informasi Institut Citra Buana Indonesia.',
  ketua_name: 'Nama Ketua', ketua_title: 'Ketua HIMA SI', sambutan: 'Selamat datang di website resmi HIMA Sistem Informasi.',
  cta_title: 'Mari Berkolaborasi', cta_desc: 'Punya ide, program, atau ingin bermitra dengan kami? Hubungi HIMA SI sekarang.',
  address: 'Sukabumi - Indonesia', phone: '+62-99999999', email: 'himasi@cbi.ac.id', quick_links: 'Kampus|#\nSiakad|#\nLMS|#\nKelas A|#\nKelas B|#',
  reg_open: 'on', reg_nav: 'Pendaftaran', topbar_location: 'Sukabumi, Indonesia', topbar_clock: 'on', topbar_tz: 'Asia/Jakarta', reg_title: 'Form Pendaftaran Anggota', reg_desc: 'Isi data diri Anda untuk bergabung bersama HIMA SI.', reg_button: 'Kirim Pendaftaran',
  reg_success: 'Terima kasih! Pendaftaran Anda sudah kami terima. Pengurus akan menghubungi Anda.', reg_closed: 'Pendaftaran sedang ditutup. Pantau terus informasi dari kami.'
};
const SETTINGS = [
  ['Identitas', [['site_name', 'Nama Situs', 'text'], ['topbar_location', 'Lokasi di bar atas (kosongkan untuk menyembunyikan)', 'text'], ['topbar_clock', 'Tampilkan jam & tanggal di bar atas', 'bool'], ['topbar_tz', 'Zona waktu jam', 'select', [['Asia/Jakarta', 'WIB (Jakarta)'], ['Asia/Makassar', 'WITA (Makassar)'], ['Asia/Jayapura', 'WIT (Jayapura)']]], ['logo', 'Logo', 'image'], ['favicon', 'Favicon', 'image'], ['hero_image', 'Gambar Hero Home (cadangan bila slider kosong)', 'image'], ['periode', 'Periode Kepengurusan (mis. 2026/2027)', 'text']]],
  ['Banner Halaman', [['banner_image', 'Banner Default (dipakai bila banner halaman kosong)', 'image'], ['banner_about', 'Banner Profil & Sejarah', 'image'], ['banner_struktur', 'Banner Struktur', 'image'], ['banner_filosofi', 'Banner Filosofi Logo', 'image'], ['banner_proker', 'Banner Proker', 'image'], ['banner_berita', 'Banner Berita', 'image'], ['banner_galery', 'Banner Galery', 'image'], ['banner_kontak', 'Banner Kontak', 'image'], ['banner_daftar', 'Banner Pendaftaran', 'image']]],
  ['Warna', [['color_primary', 'Warna Utama (biru hero)', 'color'], ['color_dark', 'Warna Biru Tua (pill judul)', 'color'], ['color_accent', 'Warna Aksen (judul hero baris 2)', 'color'], ['color_footer', 'Warna Footer', 'color']]],
  ['Home', [['hero_from', 'Background Hero: warna awal (pilih warna gelap agar teks putih terbaca)', 'color'], ['hero_mid', 'Background Hero: warna tengah', 'color'], ['hero_to', 'Background Hero: warna akhir', 'color'], ['hero_dir', 'Background Hero: arah gradasi (samakan ketiga warna untuk warna polos)', 'select', [['90deg', 'Kiri → Kanan'], ['180deg', 'Atas → Bawah'], ['135deg', 'Diagonal'], ['0deg', 'Bawah → Atas']]], ['home_title', 'Judul Hero (baris 1)', 'text'], ['home_title2', 'Judul Hero (baris 2, berwarna aksen)', 'text'], ['home_desc', 'Deskripsi Hero', 'textarea'], ['ketua_name', 'Nama Ketua', 'text'], ['ketua_title', 'Jabatan', 'text'], ['ketua_photo', 'Foto Ketua', 'image'], ['sambutan', 'Sambutan Ketua', 'textarea'], ['cta_title', 'Judul CTA Kolaborasi', 'text'], ['cta_desc', 'Deskripsi CTA', 'textarea']]],
  ['About', [['profil', 'Profil', 'textarea'], ['sejarah', 'Sejarah', 'textarea'], ['visi', 'Visi', 'textarea'], ['misi', 'Misi', 'textarea'], ['filosofi_image', 'Gambar Filosofi Logo', 'image'], ['filosofi', 'Penjelasan Filosofi Logo', 'textarea'], ['filosofi_file', 'File Download Logo (PNG/SVG/PDF/ZIP)', 'file']]],
  ['Kontak & Sosial', [['address', 'Alamat', 'text'], ['phone', 'Telepon', 'text'], ['email', 'Email', 'text'], ['instagram', 'URL Instagram', 'text'], ['tiktok', 'URL TikTok', 'text'], ['youtube', 'URL YouTube', 'text'], ['quick_links', 'Quick Links (satu per baris: Nama|URL)', 'textarea']]]
];
const REGSET = [['reg_open', 'Pendaftaran dibuka', 'bool'], ['reg_nav', 'Nama menu & judul banner (mis. Pendaftaran, Open Recruitment)', 'text'], ['reg_title', 'Judul di atas form', 'text'], ['reg_desc', 'Deskripsi di atas form', 'textarea'], ['reg_button', 'Teks tombol kirim', 'text'], ['reg_success', 'Pesan sukses setelah mengirim', 'textarea'], ['reg_closed', 'Pesan saat pendaftaran ditutup', 'textarea']];
const STRSET = [['struktur_subtitle', 'Teks di bawah judul halaman', 'text'], ['struktur_image', 'Gambar Struktur Organisasi', 'image'], ['struktur_alt', 'Deskripsi gambar (untuk pembaca layar)', 'text']];
async function collect(defs, q) { // ubah isi form pengaturan menjadi baris (tervalidasi) untuk disimpan
  const rows = [];
  for (const [k, , type, opt] of defs) {
    if (type === 'image' || type === 'file') { const f = (q.files || []).find(x => x.fieldname === k); if (f) { let u = await save(f, type === 'file'); if (type === 'file' && /^https?:/.test(u)) u += '?download'; rows.push({ key: k, value: u }); } }
    else if (type === 'color') { const v = clean(q.body[k], 7); if (/^#[0-9a-fA-F]{6}$/.test(v)) rows.push({ key: k, value: v }); }
    else if (type === 'bool') rows.push({ key: k, value: q.body[k] === 'on' ? 'on' : 'off' });
    else if (type === 'select') { const v = clean(q.body[k], 40); if (opt.some(o => o[0] === v)) rows.push({ key: k, value: v }); }
    else rows.push({ key: k, value: clean(q.body[k], type === 'textarea' ? 8000 : 500) });
  }
  return rows;
}
// Catatan: nilai kosong yang sengaja disimpan tetap kosong (tidak kembali ke default)
const getSettings = async () => { const s = { ...DEFAULTS }; for (const r of await db.settings()) if (r.value !== null && r.value !== undefined) s[r.key] = r.value; return s; };
app.use(w(async (q, r, n) => {
  r.locals.path = q.path; r.locals.safeUrl = safeUrl; r.locals.s = { ...(await getSettings()), footer_copyright: CONFIG.copyright }; // copyright selalu dari config.js
  r.locals.fd = d => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  r.locals.extsOf = extsOf; r.locals.optsOf = f => String(f.options || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 50);
  n();
}));

// ---------- Halaman publik ----------
app.get('/', w(async (q, r) => r.render('home', { news: await db.list('news', { where: { published: true }, order: ['date', false], limit: 3 }), slides: await db.list('slides', { order: ['sort', true] }) })));
app.get('/about', (q, r) => r.redirect('/about/profil'));
app.get('/about/profil', (q, r) => r.render('about'));
app.get('/about/filosofi', (q, r) => r.render('filosofi'));
app.get('/about/struktur', (q, r) => r.render('struktur'));
app.get('/proker', w(async (q, r) => {
  const a = await db.list('proker', { order: ['id', false] }), category = clean(q.query.category, 60), status = clean(q.query.status, 30);
  r.render('proker', { items: a.filter(x => (!category || x.category === category) && (!status || x.status === status)), category, status, count: st => a.filter(x => x.status === st).length });
}));
app.get('/berita', w(async (q, r) => r.render('berita', { news: await db.list('news', { where: { published: true }, order: ['date', false] }) })));
app.get('/berita/:id', w(async (q, r) => {
  const n = await db.get('news', q.params.id); if (!n || !n.published) return r.status(404).send('Berita tidak ditemukan');
  r.render('berita-detail', { n, more: await db.list('news', { where: { published: true }, neq: { id: n.id }, order: ['date', false], limit: 9 }) });
}));
app.get('/galery', w(async (q, r) => r.render('galery', { items: await db.list('gallery', { order: ['id', false] }) })));
app.get('/kontak', (q, r) => r.render('kontak', { sent: q.query.sent }));
app.post('/kontak', w(async (q, r) => {
  const b = q.body; if (b.website) return r.redirect('/kontak?sent=1'); // honeypot
  if (!(await db.rate('contact:' + q.ip, 10, 10 * 60e3))) throw bad('Terlalu banyak pesan. Coba lagi beberapa menit lagi.', 429);
  const name = clean(b.name, 100), email = clean(b.email, 200), message = clean(b.message, 3000);
  if (!name || !EMAIL.test(email) || !message) return r.redirect('/kontak?sent=0');
  await db.insert('messages', { name, email, subject: clean(b.subject, 150), message });
  r.redirect('/kontak?sent=1');
}));
// Pendaftaran (form dinamis dari CMS)
const PUBLIC_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const extsOf = f => { const l = [...new Set(String(f.options || '').toLowerCase().split(/[\s,;]+/).filter(e => PUBLIC_EXT[e]))]; const o = l.length ? l : ['jpg', 'png', 'pdf']; if (o.includes('jpg') && !o.includes('jpeg')) o.push('jpeg'); return o; };
function sniffPublic(b, ext) { // pemeriksaan isi file dari pengunjung (lebih ketat dari upload admin)
  if (ext === 'docx') return b.length > 4 && b[0] === 0x50 && b[1] === 0x4B && b.includes('[Content_Types].xml') && b.includes('word/') && !b.includes('vbaProject');
  if (!sniff(b, ext)) return false;
  if (ext === 'pdf') return !/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(b.toString('latin1'));
  return true;
}
const fieldsOf = () => db.list('form_fields', { order: ['sort', true] });
app.get('/daftar', w(async (q, r) => r.render('daftar', { fields: await fieldsOf(), errs: [], old: {}, sent: q.query.sent === '1', closed: r.locals.s.reg_open === 'off' })));
const pubUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 5, fields: 100, fieldSize: 20000, parts: 120 } });
const regGate = w(async (q, r, n) => { // dicek SEBELUM file dibaca: tutup/dibuka + pembatas percobaan
  if (r.locals.s.reg_open === 'off') return r.redirect('/daftar');
  if (!(await db.rate('reg:' + q.ip, 30, 10 * 60e3))) throw bad('Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', 429);
  n();
});
const regUpload = (q, r, n) => pubUpload.any()(q, r, err => {
  if (!err) return n();
  fieldsOf().then(fields => r.status(413).render('daftar', { fields, errs: ['File terlalu besar atau terlalu banyak (maks. 2 MB per file).'], old: {}, sent: false, closed: false })).catch(n);
});
app.post('/daftar', regGate, regUpload, w(async (q, r) => {
  if (q.body.website) return r.redirect('/daftar?sent=1'); // honeypot
  const fields = await fieldsOf(), errs = [], items = [], toStore = [];
  for (const f of fields) {
    const key = 'f_' + f.id, L = f.label;
    if (f.type === 'file') {
      const file = (q.files || []).find(x => x.fieldname === key);
      if (!file || !file.size) { if (f.required) errs.push(`${L} wajib diunggah.`); continue; }
      const ext = (file.originalname.split('.').pop() || '').toLowerCase(), okx = extsOf(f);
      if (!okx.includes(ext)) { errs.push(`Format ${L} tidak diizinkan (hanya ${okx.filter(e => e !== 'jpeg').join(', ').toUpperCase()}).`); continue; }
      if (!sniffPublic(file.buffer, ext)) { errs.push(`Isi file ${L} tidak valid atau tidak aman.`); continue; }
      const stored = crypto.randomUUID() + '.' + ext, name = file.originalname.replace(/^.*[\\/]/, '').replace(/[^\w .()\-]/g, '_').slice(0, 80) || 'file';
      toStore.push({ file, stored, ext }); items.push({ label: L, value: name, file: stored }); continue;
    }
    const raw = q.body[key], opts = r.locals.optsOf(f);
    let v = f.type === 'checkbox' ? [].concat(raw || []).map(x => clean(x, 200)).filter(Boolean) : clean([].concat(raw ?? '')[0], f.type === 'textarea' ? 2000 : 200);
    const empty = Array.isArray(v) ? !v.length : !v;
    if (empty) { if (f.required) errs.push(`${L} wajib diisi.`); continue; }
    if (f.type === 'tel' && !/^\+?[0-9][0-9\s-]{7,17}$/.test(v)) errs.push(`${L} tidak valid.`);
    else if (f.type === 'number' && !/^\d{1,20}$/.test(v)) errs.push(`${L} harus berupa angka.`);
    else if (f.type === 'email' && !EMAIL.test(v)) errs.push(`${L} tidak valid.`);
    else if ((f.type === 'select' || f.type === 'radio') && !opts.includes(v)) errs.push(`Pilihan ${L} tidak valid.`);
    else if (f.type === 'checkbox' && !v.every(x => opts.includes(x))) errs.push(`Pilihan ${L} tidak valid.`);
    else items.push({ label: L, value: Array.isArray(v) ? v.join(', ') : v });
  }
  if (errs.length) return r.status(400).render('daftar', { fields, errs, old: q.body, sent: false, closed: false });
  try { for (const t of toStore) await db.putPrivate(t.file.buffer, t.stored, PUBLIC_EXT[t.ext]); await db.insert('registrations', { data: JSON.stringify(items) }); }
  catch (e) { await db.removePrivate(toStore.map(t => t.stored)).catch(() => {}); throw e; }
  r.redirect('/daftar?sent=1');
}));

// ---------- Admin CMS ----------
const csrfOf = t => crypto.createHmac('sha256', SECRET).update(t).digest('hex');
const COOKIE = { httpOnly: true, secure: PROD, sameSite: 'strict', path: '/' };
const auth = (q, r, n) => {
  try { const t = q.cookies.hima_token; jwt.verify(t, SECRET, { algorithms: ['HS256'] }); r.locals.csrf = csrfOf(t); n(); } catch { r.redirect('/admin/login'); }
};
const csrf = (q, r, n) => { const t = q.body && q.body._csrf; if (typeof t === 'string' && t.length === 64 && safeEq(t, r.locals.csrf)) return n(); r.status(403).send('Permintaan ditolak (token keamanan tidak valid). Muat ulang halaman lalu coba lagi.'); };
const AP = [auth, upload.any(), csrf]; // semua POST admin: login + upload + token CSRF
app.get('/admin/login', (q, r) => r.render('admin/login', { err: null }));
app.post('/admin/login', w(async (q, r) => {
  if (!(await db.rate('login:' + q.ip, 8, 15 * 60e3))) return r.status(429).render('admin/login', { err: 'Terlalu banyak percobaan login. Coba lagi 15 menit lagi.' });
  const ok = safeEq(clean(q.body.username, 100), ADMIN_USER) & safeEq(String(q.body.password || '').slice(0, 200), ADMIN_PASS);
  if (!ok) return r.status(401).render('admin/login', { err: 'Username atau password salah.' });
  r.cookie('hima_token', jwt.sign({ a: 1 }, SECRET, { algorithm: 'HS256', expiresIn: '12h' }), { ...COOKIE, maxAge: 12 * 36e5 }); r.redirect('/admin');
}));
app.post('/admin/logout', ...AP, (q, r) => { r.clearCookie('hima_token', COOKIE); r.redirect('/admin/login'); });

const SORTED = ['sort', true];
const RES = {
  berita: { t: 'news', label: 'Berita', req: ['title'], cols: ['title', 'date'], order: ['date', false], fields: [['title', 'Judul', 'text'], ['date', 'Tanggal', 'date'], ['image', 'Gambar Utama (di samping teks)', 'image'], ['image2', 'Foto Tambahan 1', 'image'], ['image3', 'Foto Tambahan 2', 'image'], ['image4', 'Foto Tambahan 3', 'image'], ['body', 'Isi Berita', 'textarea'], ['published', 'Tampilkan di website', 'bool']] },
  galery: { t: 'gallery', label: 'Galery', req: [], cols: ['title', 'date'], order: ['id', false], fields: [['title', 'Judul Album (opsional)', 'text'], ['date', 'Tanggal', 'date'], ['image', 'Thumbnail / Cover (opsional, otomatis foto pertama)', 'image'], ['photos', 'Foto Album (bisa banyak)', 'images']] },
  proker: { t: 'proker', label: 'Proker', req: ['title'], cols: ['title', 'divisi', 'status'], order: ['id', false], fields: [['title', 'Nama Kegiatan', 'text'], ['divisi', 'Divisi (mis. Divisi Akademik)', 'text'], ['category', 'Kategori', 'select', ['Akademik', 'Minat & bakat', 'Sosial', 'Pengembangan Organisasi']], ['status', 'Status', 'select', ['Sedang Berjalan', 'Selesai', 'Akan Datang']], ['date_text', 'Waktu (mis. April 2026)', 'text'], ['description', 'Deskripsi', 'textarea']] },
  slider: { t: 'slides', label: 'Slider Home', req: ['title'], cols: ['title', 'title2', 'sort'], order: SORTED, fields: [['title', 'Judul baris 1', 'text'], ['title2', 'Judul baris 2 (warna aksen)', 'text'], ['description', 'Deskripsi', 'textarea'], ['image', 'Gambar (sisi kanan)', 'image'], ['button_text', 'Teks tombol', 'text'], ['button_url', 'Link tombol (mis. /about/profil)', 'text'], ['sort', 'Urutan tampil', 'number']] },
  formulir: { t: 'form_fields', label: 'Form Pendaftaran', req: ['label'], cols: ['label', 'type', 'required', 'sort'], order: SORTED, fields: [['label', 'Label Pertanyaan (mis. Nama, NIM)', 'text'], ['type', 'Tipe Isian', 'select', [['text', 'Teks singkat'], ['number', 'Angka (mis. NIM)'], ['tel', 'No. Handphone'], ['email', 'Email'], ['textarea', 'Teks panjang (mis. Pesan)'], ['select', 'Dropdown (pilih satu)'], ['file', 'Upload File (foto / PDF / dokumen)'], ['radio', 'Pilihan tunggal (radio)'], ['checkbox', 'Pilihan ganda (checkbox)']]], ['required', 'Wajib diisi', 'bool'], ['options', 'Dropdown/Radio/Checkbox: daftar pilihan, satu per baris.  |  Upload File: jenis file diizinkan dipisah koma (jpg, png, webp, pdf, docx); kosong = jpg, png, pdf', 'textarea'], ['placeholder', 'Placeholder / contoh isian (opsional)', 'text'], ['sort', 'Urutan tampil', 'number']] }
};
const adm = (q, r, v, d = {}) => r.render(v, { ...d, RES, active: d.active || '' });
app.get('/admin', auth, w(async (q, r) => adm(q, r, 'admin/dashboard', { active: 'dash', stats: { Berita: await db.count('news'), Galery: await db.count('gallery'), Proker: await db.count('proker'), Pendaftar: await db.count('registrations'), 'Pesan baru': await db.count('messages', { is_read: false }) } })));
app.get('/admin/settings', auth, w(async (q, r) => { const S = await getSettings(); S.hero_from = S.hero_from || S.color_primary; S.hero_mid = S.hero_mid || S.color_dark; S.hero_to = S.hero_to || '#000000'; adm(q, r, 'admin/settings', { active: 'settings', S, SETTINGS, saved: q.query.saved }); }));
app.post('/admin/settings', ...AP, w(async (q, r) => { await db.saveSettings(await collect(SETTINGS.flatMap(g => g[1]), q)); r.redirect('/admin/settings?saved=1'); }));
app.get('/admin/messages', auth, w(async (q, r) => adm(q, r, 'admin/messages', { active: 'messages', msgs: await db.list('messages', { order: ['id', false] }) })));
app.post('/admin/messages/:id/read', ...AP, w(async (q, r) => { await db.update('messages', q.params.id, { is_read: true }); r.redirect('/admin/messages'); }));
app.post('/admin/messages/:id/delete', ...AP, w(async (q, r) => { await db.remove('messages', q.params.id); r.redirect('/admin/messages'); }));

// Data pendaftar
const regs = async () => (await db.list('registrations', { order: ['id', false] })).map(x => { let items = []; try { items = JSON.parse(x.data) || []; } catch {} return { ...x, items }; });
app.get('/admin/pendaftar', auth, w(async (q, r) => { const rows = await regs(); adm(q, r, 'admin/pendaftar', { active: 'pendaftar', rows, cols: [...new Set(rows.flatMap(x => x.items.map(i => i.label)))].reverse() }); }));
app.get('/admin/pendaftar/export.csv', auth, w(async (q, r) => {
  const rows = (await regs()).reverse(), cols = [...new Set(rows.flatMap(x => x.items.map(i => i.label)))];
  const cell = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }; // cegah CSV/formula injection
  const out = [['Waktu', ...cols].map(cell).join(',')].concat(rows.map(x => [x.created_at, ...cols.map(c => (x.items.find(i => i.label === c) || {}).value)].map(cell).join(',')));
  r.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pendaftar.csv"', 'Cache-Control': 'no-store' }); r.send('\uFEFF' + out.join('\r\n'));
}));
app.get('/admin/pendaftar/export.xlsx', auth, w(async (q, r) => {
  const ExcelJS = require('exceljs'), s = r.locals.s, fields = await fieldsOf(), rows = (await regs()).reverse();
  const cols = [...new Set([...fields.map(f => f.label), ...rows.flatMap(x => x.items.map(i => i.label))])], typeOf = Object.fromEntries(fields.map(f => [f.label, f.type]));
  const hx = v => 'FF' + String(v).replace('#', '').toUpperCase(), DARK = hx(s.color_dark), PRIM = hx(s.color_primary), N = cols.length + 2;
  const when = x => { const v = String(x), d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(' ', 'T') + 'Z'); return new Date(d.getTime() + 7 * 36e5); }; // tampil sebagai WIB
  const thin = { style: 'thin', color: { argb: 'FFD0D7DE' } }, border = { top: thin, left: thin, bottom: thin, right: thin };
  const wb = new ExcelJS.Workbook(); wb.creator = s.site_name; wb.created = new Date();
  const ws = wb.addWorksheet('Pendaftar', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' } });
  ws.mergeCells(1, 1, 1, N); Object.assign(ws.getCell(1, 1), { value: s.reg_title, font: { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } }); ws.getRow(1).height = 32;
  ws.mergeCells(2, 1, 2, N); Object.assign(ws.getCell(2, 1), { value: `Total pendaftar: ${rows.length}   •   Diekspor: ${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' }).format(new Date())} WIB`, font: { italic: true, color: { argb: 'FF57606A' } }, alignment: { vertical: 'middle', indent: 1 } }); ws.getRow(2).height = 20; ws.getRow(3).height = 6;
  const head = ws.getRow(4); head.values = ['No', 'Waktu Daftar', ...cols]; head.height = 26;
  head.eachCell(c => Object.assign(c, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIM } }, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, border }));
  rows.forEach((x, i) => {
    const row = ws.addRow([i + 1, when(x.created_at), ...cols.map(c => { const it = x.items.find(t => t.label === c) || {}; return it.file ? { text: it.value, hyperlink: `${q.protocol}://${q.get('host')}/admin/pendaftar/file/${it.file}?as=${encodeURIComponent(it.value)}` } : (it.value || ''); })]);
    row.eachCell({ includeEmpty: true }, (c, n) => { c.border = border; c.alignment = { vertical: 'top', wrapText: true, horizontal: n === 1 ? 'center' : 'left' }; if (c.value && c.value.hyperlink) c.font = { color: { argb: 'FF0563C1' }, underline: true }; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8FC' } }; if (n > 2) c.numFmt = '@'; }); // @ = teks, agar NIM/HP tidak kehilangan angka 0
    row.getCell(2).numFmt = 'dd/mm/yyyy hh:mm'; row.getCell(2).alignment = { vertical: 'top', horizontal: 'center' };
  });
  ws.getColumn(1).width = 6; ws.getColumn(2).width = 19;
  cols.forEach((c, i) => { const len = Math.max(c.length + 4, ...rows.map(x => String((x.items.find(t => t.label === c) || {}).value || '').length * 1.1)); ws.getColumn(i + 3).width = Math.max(18, Math.min(typeOf[c] === 'textarea' ? 50 : 38, Math.ceil(len))); });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(rows.length, 1), column: N } };
  const sm = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] }); sm.getColumn(1).width = 30; sm.getColumn(2).width = 34; sm.getColumn(3).width = 12; sm.getColumn(4).width = 12;
  sm.mergeCells('A1:D1'); Object.assign(sm.getCell('A1'), { value: 'Ringkasan Pendaftar', font: { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }, alignment: { vertical: 'middle', indent: 1 } }); sm.getRow(1).height = 32;
  const tot = sm.addRow(['Total pendaftar', rows.length]); tot.font = { bold: true }; tot.getCell(2).alignment = { horizontal: 'left' }; sm.addRow([]);
  for (const f of fields.filter(f => ['select', 'radio', 'checkbox'].includes(f.type))) {
    const opts = r.locals.optsOf(f), vals = rows.map(x => (x.items.find(t => t.label === f.label) || {}).value).filter(Boolean), n = o => vals.filter(v => f.type === 'checkbox' ? v.split(', ').includes(o) : v === o).length;
    const h = sm.addRow([f.label, 'Pilihan', 'Jumlah', 'Persen']); h.eachCell(c => Object.assign(c, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIM } }, border, alignment: { horizontal: 'center' } }));
    opts.forEach(o => { const rw = sm.addRow(['', o, n(o), vals.length ? n(o) / vals.length : 0]); rw.eachCell({ includeEmpty: true }, c => { c.border = border; }); rw.getCell(4).numFmt = '0%'; rw.getCell(3).alignment = { horizontal: 'center' }; rw.getCell(4).alignment = { horizontal: 'center' }; });
    sm.addRow([]);
  }
  const fn = `pendaftar-${String(s.reg_title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'form'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  r.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${fn}"`, 'Cache-Control': 'no-store' });
  r.send(Buffer.from(await wb.xlsx.writeBuffer()));
}));
const fileNames = items => items.map(i => i.file).filter(Boolean);
app.get('/admin/pendaftar/file/:name', auth, w(async (q, r) => {
  const n = q.params.name; if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf|docx)$/.test(n)) return r.sendStatus(404);
  const ext = n.split('.').pop(), as = (clean(q.query.as, 80).replace(/[^\w .()\-]/g, '_').replace(/\.[^.]*$/, '') || 'file') + '.' + ext;
  const f = await db.getPrivate(n, as); if (!f) return r.sendStatus(404);
  if (f.url) return r.redirect(f.url); // Supabase: tautan bertanda tangan, berlaku 60 detik
  r.set({ 'Content-Type': PUBLIC_EXT[ext], 'Content-Disposition': `attachment; filename="${as}"`, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'no-store' }); r.send(f.buf);
}));
app.post('/admin/pendaftar/clear', ...AP, w(async (q, r) => { await db.removePrivate(fileNames((await regs()).flatMap(x => x.items))); await db.clear('registrations'); r.redirect('/admin/pendaftar'); }));
app.post('/admin/pendaftar/:id/delete', ...AP, w(async (q, r) => {
  const row = await db.get('registrations', q.params.id);
  if (row) { let items = []; try { items = JSON.parse(row.data) || []; } catch {} await db.removePrivate(fileNames(items)); await db.remove('registrations', q.params.id); }
  r.redirect('/admin/pendaftar');
}));

// Struktur Organisasi: unggah gambar
app.get('/admin/struktur', auth, w(async (q, r) => adm(q, r, 'admin/struktur', { active: 'struktur', S: await getSettings(), saved: q.query.saved })));
app.post('/admin/struktur', ...AP, w(async (q, r) => {
  const rows = await collect(STRSET, q);
  if (q.body.remove_image === 'on' && !rows.some(x => x.key === 'struktur_image')) rows.push({ key: 'struktur_image', value: '' });
  await db.saveSettings(rows); r.redirect('/admin/struktur?saved=1');
}));

// Form Pendaftaran: pengaturan teks halaman + daftar pertanyaan
app.get('/admin/formulir', auth, w(async (q, r) => adm(q, r, 'admin/formulir', { active: 'formulir', c: RES.formulir, key: 'formulir', rows: await fieldsOf(), REGSET, S: await getSettings(), saved: q.query.saved })));
app.post('/admin/formulir/settings', ...AP, w(async (q, r) => { await db.saveSettings(await collect(REGSET, q)); r.redirect('/admin/formulir?saved=1'); }));

// CRUD generik
const R = (q, r, n) => Object.hasOwn(RES, q.params.r) ? n() : r.sendStatus(404);
app.get('/admin/:r', auth, R, w(async (q, r) => { const c = RES[q.params.r]; adm(q, r, 'admin/list', { active: q.params.r, c, key: q.params.r, rows: await db.list(c.t, { order: c.order }) }); }));
app.get('/admin/:r/new', auth, R, (q, r) => adm(q, r, 'admin/form', { active: q.params.r, c: RES[q.params.r], key: q.params.r, row: {} }));
app.get('/admin/:r/:id/edit', auth, R, w(async (q, r) => { const c = RES[q.params.r], row = await db.get(c.t, q.params.id); if (!row) return r.sendStatus(404); adm(q, r, 'admin/form', { active: q.params.r, c, key: q.params.r, row }); }));
app.post('/admin/:r/:id/delete', ...AP, R, w(async (q, r) => { await db.remove(RES[q.params.r].t, q.params.id); r.redirect('/admin/' + q.params.r); }));
app.post('/admin/:r/:id?', ...AP, R, w(async (q, r) => {
  const c = RES[q.params.r], id = q.params.id, row = {}, old = id ? await db.get(c.t, id) : {};
  if (!old) return r.sendStatus(404);
  for (const [n, , type, opt] of c.fields) {
    const f = (q.files || []).filter(x => x.fieldname === n);
    if (type === 'image') { if (f[0]) row[n] = await save(f[0], false); }
    else if (type === 'images') {
      const rm = [].concat(q.body['remove_' + n] || []); let keep = []; try { keep = JSON.parse(old[n] || '[]'); } catch {}
      const added = []; for (const x of f) added.push(await save(x, false));
      row[n] = JSON.stringify([...keep.filter(u => !rm.includes(u)), ...added]);
    }
    else if (type === 'bool') row[n] = q.body[n] === 'on';
    else if (type === 'number') row[n] = Math.max(-1e9, Math.min(1e9, Number(q.body[n]) || 0));
    else if (type === 'date') row[n] = /^\d{4}-\d{2}-\d{2}$/.test(String(q.body[n])) ? q.body[n] : null;
    else if (type === 'select') { const ok = opt.map(o => Array.isArray(o) ? o[0] : o), v = clean(q.body[n], 60); row[n] = ok.includes(v) ? v : ok[0]; }
    else row[n] = clean(q.body[n], type === 'textarea' ? 20000 : 500) || null;
  }
  for (const k of c.req) if (!row[k]) throw bad(`Kolom "${c.fields.find(x => x[0] === k)[1]}" wajib diisi.`);
  if (c.t === 'gallery' && !row.image && !old.image) { try { row.image = JSON.parse(row.photos)[0] || null; } catch {} }
  if (id) await db.update(c.t, id, row); else await db.insert(c.t, row);
  r.redirect('/admin/' + q.params.r);
}));

app.use((q, r) => r.status(404).send('Halaman tidak ditemukan'));
app.use((e, q, r, n) => {
  if (e && /^LIMIT_/.test(e.code || '')) e = bad('File terlalu besar atau terlalu banyak (maks. 4 MB per file).', 413);
  const hint = !e.safe && db.explain ? db.explain(e) : null;
  if (!e.safe) { console.error(e); if (hint) console.error('\n>>> SARAN: ' + hint + '\n'); }
  // Saran detail hanya ditampilkan di browser saat pengembangan lokal; di production pengunjung hanya melihat pesan umum
  r.status(e.status || 500).send(e.safe ? e.message : (hint && !PROD ? 'Terjadi kesalahan: ' + hint : 'Terjadi kesalahan pada server.'));
});
module.exports = app;
