# Website HIMA Sistem Informasi — Panduan Deploy (GitHub → Vercel + Supabase)

Stack: Node.js (Express + EJS) · Tailwind CSS · Bootstrap Icons · GSAP · Supabase (database + storage) · Vercel (hosting).
Bacalah juga `SECURITY.md` untuk ringkasan pengamanan.

## Gambaran alur
```
Kode (GitHub)  ──push──▶  Vercel (build & hosting)  ──▶  Supabase (database + file gambar)
```
Anda butuh 3 akun gratis: **GitHub**, **Supabase**, **Vercel**. Disarankan mengaktifkan **2FA (verifikasi 2 langkah)** di ketiganya.

---

## Langkah 1 — Unggah kode ke GitHub
1. Ekstrak `hima-si.zip`, buka terminal di folder `hima-si`.
2. Buat repository baru di https://github.com/new → nama `hima-si`, pilih **Private**, **jangan** centang "Add README".
3. Jalankan:
```bash
git init
git add .
git status          # PASTIKAN tidak ada file ".env" di daftar. Jika ada, STOP dan periksa .gitignore
git commit -m "Website HIMA SI"
git branch -M main
git remote add origin https://github.com/USERNAME/hima-si.git
git push -u origin main
```
> Jangan pernah meng-commit `.env` atau kunci Supabase. Jika terlanjur, anggap kunci bocor: ganti (rotate) kuncinya di Supabase.

## Langkah 2 — Siapkan Supabase
1. Masuk https://supabase.com → **New project**.
   - Name: `hima-si` · Database password: buat yang kuat & simpan · Region: **Southeast Asia (Singapore)**.
   - Tunggu ±2 menit sampai project siap.
2. Buka **SQL Editor → New query**, salin seluruh isi file **`supabase.sql`**, klik **Run**. Skrip ini membuat tabel, mengaktifkan keamanan (RLS), mengisi form pendaftaran bawaan, dan membuat bucket gambar `media`.
3. Verifikasi:
   - **Table Editor**: semua tabel (`news`, `gallery`, `proker`, `members`, `slides`, `messages`, `settings`, `form_fields`, `registrations`, `rate_limits`) tampil dengan label **RLS enabled**.
   - **Storage**: ada bucket `media` (Public).
4. Ambil kunci di **Project Settings → API** (atau **API Keys**):
   - **Project URL** → untuk `SUPABASE_URL` (bentuk `https://xxxx.supabase.co`).
   - **`service_role` key** (atau **Secret key** `sb_secret_...` pada tampilan baru) → untuk `SUPABASE_SERVICE_KEY`.
   > Kunci ini **RAHASIA** (akses penuh ke database). Hanya diisi di Vercel, tidak pernah di kode/GitHub/browser. **Jangan** pakai kunci `anon`/publishable di sini.

## Langkah 3 — Deploy di Vercel
1. Masuk https://vercel.com → **Add New… → Project** → hubungkan GitHub → pilih repo `hima-si` → **Import**.
2. **Framework Preset: Other**. Build Command / Output Directory sudah diatur oleh `vercel.json` (jangan diubah).
3. Buka **Environment Variables**, tambahkan 5 variabel (semua environment):

| Nama | Isi |
|---|---|
| `SUPABASE_URL` | Project URL dari Langkah 2 |
| `SUPABASE_SERVICE_KEY` | service_role / secret key |
| `ADMIN_USER` | username login CMS (jangan `admin`) |
| `ADMIN_PASS` | password kuat, **minimal 10 karakter** |
| `JWT_SECRET` | string acak **minimal 32 karakter** |

   Membuat `JWT_SECRET` acak: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. Klik **Deploy**. Setelah selesai, buka alamat `https://hima-si-xxxx.vercel.app`.
   > Jika variabel kurang/lemah, aplikasi **sengaja menolak jalan** dengan pesan `KONFIGURASI TIDAK AMAN` di **Logs**. Perbaiki variabelnya lalu **Redeploy**.
5. **Percepat aplikasi**: Vercel → project → **Settings → Functions → Function Region** → pilih **Singapore (sin1)** agar dekat dengan Supabase, lalu Redeploy.

## Langkah 4 — Mulai mengisi konten
Buka `https://domain-anda/admin` → login dengan `ADMIN_USER` / `ADMIN_PASS`:
- **Pengaturan Situs**: logo, favicon, warna tema, **warna background hero Home** (3 warna + arah gradasi), **lokasi & jam di bar atas** (zona WIB/WITA/WIT), banner tiap halaman, sambutan, profil, visi/misi, filosofi logo + file download, kontak, sosmed.
- **Slider Home**, **Berita**, **Proker**, **Galery** (album banyak foto), **Struktur**.
- **Form Pendaftaran**: di bagian atas halaman ini Anda mengubah **nama menu, judul, deskripsi, teks tombol, pesan sukses/tutup, dan buka/tutup pendaftaran** (agar bisa dipakai untuk pendaftaran lain, mis. Open Recruitment atau seminar). Di bawahnya, tambah/ubah/hapus pertanyaan (teks, angka, HP, email, dropdown, radio, checkbox), tandai wajib, atur urutan.
- **Data Pendaftar**: lihat, hapus, **Unduh Excel (.xlsx)** yang sudah rapi (judul, header berwarna, filter, baris beku, NIM/HP tetap utuh, plus lembar *Ringkasan* jumlah & persen tiap pilihan), **CSV**, dan **Hapus Semua** untuk memulai periode pendaftaran baru (unduh dulu sebelum menghapus).
- **Pesan Masuk**: pesan dari halaman Kontak.

## Langkah 5 — Domain sendiri (opsional)
Vercel → project → **Settings → Domains** → tambahkan domain, ikuti petunjuk DNS. HTTPS otomatis.

## Memperbarui website
Ubah kode → `git add . && git commit -m "pesan" && git push` → Vercel otomatis deploy ulang. Perubahan konten lewat CMS tidak perlu deploy.

---

## Checklist keamanan setelah deploy
- [ ] `ADMIN_USER` unik, `ADMIN_PASS` ≥ 10 karakter (disarankan 16+), `JWT_SECRET` acak ≥ 32 karakter.
- [ ] 2FA aktif di GitHub, Supabase, Vercel. Repo GitHub **Private**.
- [ ] Kunci `service_role` hanya ada di Vercel. Pernah terlihat orang lain/ter-commit → **rotate** di Supabase lalu ubah di Vercel.
- [ ] Login ke `/admin` dan buka **Pengaturan Situs → Simpan** sekali untuk memastikan semuanya berfungsi.
- [ ] Di Supabase **Table Editor**, semua tabel berlabel **RLS enabled** (jangan dimatikan).
- [ ] Aktifkan Dependabot di GitHub (**Settings → Code security**) agar menerima update keamanan paket.
- [ ] Data pendaftar berisi NIM & nomor HP: unduh CSV seperlunya, simpan aman, hapus bila tak dibutuhkan.
- [ ] Mengganti `ADMIN_PASS`/`JWT_SECRET` di Vercel lalu Redeploy akan **mengeluarkan semua sesi login** (berguna bila curiga ada yang membobol).

## Uji lokal dengan Supabase (opsional)
```bash
npm install
cp .env.example .env     # isi nilai asli (file .env tidak ikut ke GitHub)
npm run dev              # http://localhost:3000  | CMS: /admin
```
Untuk uji tanpa internet/Supabase gunakan paket `hima-si-local` (SQLite).

## Pemecahan masalah
| Gejala | Penyebab & solusi |
|---|---|
| Halaman 500 / `KONFIGURASI TIDAK AMAN` | Cek **Vercel → Deployments → Logs**. Lengkapi 5 environment variable lalu Redeploy. |
| Tampilan tanpa gaya (CSS hilang) | Build gagal membuat `public/css/app.css`. Lihat **Build Logs**; pastikan Build Command = `npm run build`. |
| Ikon / animasi tidak muncul | Pastikan build menjalankan `npm install` (skrip `postinstall` menyalin GSAP & ikon ke `public/vendor`). |
| `relation "xxx" does not exist` | `supabase.sql` belum dijalankan/ gagal. Jalankan ulang (aman diulang). |
| Gambar gagal diupload (413 / "terlalu besar") | Maks. 4 MB per file dan total request ±4,5 MB (batas Vercel). Foto album diperkecil otomatis di browser; kurangi jumlah foto per simpan. |
| Gambar tidak tampil | Bucket `media` harus **Public**. Pastikan `SUPABASE_URL` benar (CSP hanya mengizinkan gambar dari domain itu). |
| Login terkunci "terlalu banyak percobaan" | Tunggu 15 menit, atau di Supabase **Table Editor → `rate_limits`** hapus baris `login:...`. |
| Website lambat saat pertama dibuka | Project Supabase **gratis** otomatis *pause* bila tidak aktif ±1 minggu. Buka **Dashboard → Restore**, atau upgrade/aktifkan kunjungan rutin. |

## Catatan paket gratis
- Vercel Hobby ditujukan untuk penggunaan non-komersial; organisasi kampus umumnya sesuai — periksa ketentuan terbaru Vercel.
- Supabase gratis: 500 MB database, 1 GB storage, dan project di-*pause* saat lama tidak aktif. Backup otomatis harian hanya di paket berbayar → rutin **Unduh CSV** pendaftar dan simpan cadangan penting.
