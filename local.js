require('dotenv').config();
const db = require('./db');
// Cek koneksi & izin database saat dinyalakan, supaya masalah konfigurasi langsung terlihat di terminal
db.settings().then(() => console.log('✔ Koneksi Supabase OK')).catch(e => {
  console.error('✘ Gagal membaca database Supabase:', (e && e.message) || e);
  const h = db.explain(e); if (h) console.error('  SARAN: ' + h);
});
require('./app').listen(process.env.PORT || 3000, () => console.log('Website: http://localhost:3000  |  CMS: http://localhost:3000/admin'));
