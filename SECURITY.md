# Laporan Keamanan — Website HIMA SI

Tanggal tinjauan: 18 November 2026. Cakupan: kode aplikasi (Express/EJS), konfigurasi Vercel & Supabase, dependensi npm.
Seluruh poin di bawah **sudah diuji otomatis** (uji otomatis berupa permintaan HTTP nyata terhadap server) pada kode yang sama dengan paket ini. Database Supabase disimulasikan dengan klien tiruan, jadi lakukan juga uji cepat setelah deploy ke Supabase & Vercel yang asli (login, upload gambar, kirim form).

## 1. Ringkasan ancaman → perlindungan
| Ancaman | Perlindungan yang diterapkan |
|---|---|
| **Pembobolan login admin** | Password dibandingkan dengan `timingSafeEqual`; pembatas **8 percobaan / 15 menit / IP** (tersimpan di tabel `rate_limits`, bersama untuk semua instance Vercel); pesan error generik; produksi **menolak start** bila `ADMIN_PASS` < 10 karakter atau `JWT_SECRET` < 24 karakter. |
| **Pembajakan sesi** | Cookie `HttpOnly` + `Secure` (produksi) + `SameSite=Strict`; JWT dikunci algoritma HS256, kedaluwarsa 12 jam. |
| **CSRF** | Token CSRF (HMAC dari sesi) wajib di **semua** aksi tulis admin; logout kini `POST`. Ditambah `SameSite=Strict`. |
| **XSS** | Semua keluaran di-escape (EJS); URL dari CMS disaring (`javascript:` ditolak); warna divalidasi `#RRGGBB`; **CSP ketat**: `script-src 'self'` (GSAP & ikon di-host sendiri, tanpa CDN), tanpa inline script/handler, `frame-ancestors 'none'`, `object-src 'none'`. |
| **SQL injection** | Versi lokal: prepared statement + nama tabel/kolom dari whitelist. Versi Supabase: query ter-parameter oleh `supabase-js`. Parameter `:id` hanya angka; nama resource divalidasi `Object.hasOwn`. |
| **Upload berbahaya** | Whitelist ekstensi (jpg/png/gif/webp/svg/ico; pdf/zip khusus file download), **pemeriksaan isi file (magic bytes)**, SVG dengan `<script>`/`on*=`/`javascript:` ditolak, nama file diganti UUID acak, maks. 4 MB, hanya admin yang bisa upload. Bucket Supabase dibatasi 4 MB & tipe MIME. File lokal disajikan dengan CSP `sandbox`. |
| **Akses data langsung ke Supabase** | **RLS aktif di semua tabel tanpa policy**, dan izin tabel **hanya diberikan ke `service_role`** (izin `anon`/`authenticated` dicabut) → API publik Supabase tidak bisa membaca/menulis apa pun; hanya server dengan Secret key. |
| **Upload file oleh pengunjung (tipe "Upload File")** | Hanya ekstensi dalam whitelist yang diatur admin (jpg/png/webp/pdf/docx), **isi file diperiksa** (magic bytes; PDF berisi `/JavaScript`, `/Launch`, `/EmbeddedFile` ditolak; docx bermakro ditolak), maks. 2 MB & 5 file, nama file diganti UUID, dibatasi per IP. File disimpan **privat** (di luar folder publik / bucket Supabase privat), **tidak punya URL publik**; hanya admin yang dapat mengunduh (`attachment`, CSP `sandbox`, tautan bertanda tangan 60 detik di Supabase). File ikut terhapus bersama datanya. |
| **Penyalahgunaan data pendaftar** | Ekspor Excel menulis semua isian sebagai **teks** (isian berawalan `=`, `+`, `-`, `@` tidak dieksekusi sebagai rumus); CSV diberi tanda petik pengaman; "Hapus Semua" wajib login + token CSRF + konfirmasi. |
| **Spam & penyalahgunaan form publik** | Honeypot, validasi sisi server (panjang, format NIM/HP/email, pilihan harus sesuai opsi), pembatas per IP (pendaftaran 30/10 mnt, kontak 10/10 mnt, cukup longgar untuk WiFi kampus). |
| **Kebocoran informasi** | Error server tidak menampilkan detail; header `X-Powered-By` dihapus; berita *draft* tidak bisa diakses publik; `CSV export` mencegah *formula injection* (`=`, `+`, `-`, `@`). |
| **Clickjacking / sniffing** | `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`. |
| **Pemalsuan IP (X-Forwarded-For)** | `trust proxy` hanya aktif di produksi (di belakang Vercel). |
| **Rantai pasok (dependensi)** | `npm audit --omit=dev` = **0 kerentanan**; multer dinaikkan ke 2.x; Dependabot disertakan (`.github/dependabot.yml`). |

## 2. Hasil `npm audit`
- Paket yang berjalan di server (`--omit=dev`): **0 kerentanan**. Pustaka Excel (`exceljs`) membawa `uuid` versi lama yang rentan; ditutup dengan `overrides` ke `uuid` 11.x (sudah diuji, ekspor Excel tetap berfungsi).
- Paket pengembangan: 10 temuan *severity high* yang seluruhnya berasal dari satu advisori `picomatch` (ReDoS) pada **alat build Tailwind**. Belum ada versi perbaikan dari pihak pengembang. Tidak dikirim/dijalankan di server dan hanya memproses file milik sendiri, sehingga **tidak dapat dieksploitasi dari luar**. Pantau lewat Dependabot.

## 3. Risiko tersisa & rekomendasi (jujur)
1. **Satu akun admin** dengan kredensial di environment variable. Gunakan password panjang unik; ganti berkala. Bila kredensial bocor, ganti `ADMIN_PASS` + `JWT_SECRET` dan Redeploy (semua sesi berakhir).
2. **JWT tanpa daftar pencabutan**: logout menghapus cookie, tetapi token yang sudah dicuri tetap sah sampai kedaluwarsa (maks. 12 jam). Mitigasi: ganti `JWT_SECRET`.
3. **Pembatas login berbasis IP**: penyerang dengan banyak IP dapat melewatinya. Password panjang adalah pertahanan utama. Untuk ketahanan lebih lanjut gunakan Vercel Firewall / Cloudflare.
4. **CSP memakai `style-src 'unsafe-inline'`** (diperlukan atribut `style` & tema warna dinamis). Skrip tetap diblokir total kecuali dari domain sendiri, sehingga risikonya rendah.
5. **Google Fonts** dimuat dari pihak ketiga (hanya stylesheet/font). Bila ingin bebas pihak ketiga, host font sendiri.
6. **Data pribadi pendaftar** (NIM, HP): batasi siapa yang memegang akun admin, unduh/hapus sesuai kebutuhan, dan beri tahu calon anggota tujuan penggunaan datanya.
7. **File dari pengunjung tidak dipindai antivirus.** Walau sudah disaring ketat, anggap file tetap tidak tepercaya: jangan buka di komputer tanpa proteksi, gunakan pratinjau/antivirus, dan hindari mengaktifkan docx dari sumber tak dikenal.
8. **Admin tepercaya**: konten yang diisi admin (teks, SVG bersih) dianggap tepercaya; walau sudah disaring, jangan mengunggah file dari sumber tak dikenal.
9. Project Supabase gratis bisa *pause* & tidak punya backup harian otomatis → ekspor data berkala.

## 4. Melaporkan kerentanan
Bila menemukan celah, hubungi pengelola website (email di footer) dan jangan menyebarkannya publik sebelum diperbaiki.
