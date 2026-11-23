-- =====================================================================
-- HIMA SI - Skema database Supabase (aman dijalankan berulang kali)
-- Jalankan di: Supabase Dashboard > SQL Editor > New query > Run
-- =====================================================================

create table if not exists settings (key text primary key, value text);
create table if not exists news (id bigserial primary key, title text not null, date date default current_date, image text, image2 text, image3 text, image4 text, body text, published boolean default true, created_at timestamptz default now());
create table if not exists gallery (id bigserial primary key, title text, date date, image text, photos text, created_at timestamptz default now());
create table if not exists proker (id bigserial primary key, title text not null, divisi text, category text, status text default 'Akan Datang', date_text text, description text, created_at timestamptz default now());
create table if not exists slides (id bigserial primary key, title text, title2 text, description text, image text, button_text text, button_url text, sort int default 0, created_at timestamptz default now());
create table if not exists messages (id bigserial primary key, name text, email text, subject text, message text, is_read boolean default false, created_at timestamptz default now());
create table if not exists form_fields (id bigserial primary key, label text not null, type text default 'text', required boolean default true, options text, placeholder text, sort int default 0);
create table if not exists registrations (id bigserial primary key, data text, created_at timestamptz default now());
create table if not exists rate_limits (key text primary key, count int not null default 0, reset_at timestamptz not null);

-- Jika sebelumnya sudah punya tabel versi lama, tambahkan kolom yang baru:
alter table news    add column if not exists image2 text;
alter table news    add column if not exists image3 text;
alter table news    add column if not exists image4 text;
alter table gallery add column if not exists photos text;

-- ---------------------------------------------------------------------
-- KEAMANAN: aktifkan Row Level Security di SEMUA tabel.
-- Tanpa policy = anon/publik TIDAK bisa membaca/menulis apa pun lewat API Supabase.
-- Hanya server (memakai service_role key) yang dapat mengakses data.
-- ---------------------------------------------------------------------
alter table settings      enable row level security;
alter table news          enable row level security;
alter table gallery       enable row level security;
alter table proker        enable row level security;
alter table slides        enable row level security;
alter table messages      enable row level security;
alter table form_fields   enable row level security;
alter table registrations enable row level security;
alter table rate_limits   enable row level security;

-- ---------------------------------------------------------------------
-- IZIN AKSES API. WAJIB pada project Supabase baru.
-- Project baru TIDAK lagi memberi akses otomatis ke tabel yang dibuat lewat SQL Editor,
-- sehingga server (role service_role, yaitu kunci sb_secret_...) akan error
-- "permission denied for table ..." (kode 42501) bila bagian ini tidak dijalankan.
-- Sengaja TIDAK ada izin untuk anon / authenticated: data tidak bisa diakses publik.
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
revoke all on settings, news, gallery, proker, slides, messages, form_fields, registrations, rate_limits from anon, authenticated;

-- Isian awal Form Pendaftaran (hanya jika masih kosong)
insert into form_fields (label, type, required, options, placeholder, sort)
select * from (values
  ('Nama Lengkap',  'text',     true,  '', 'Nama sesuai KTM', 1),
  ('NIM',           'number',   true,  '', 'Contoh: 2026010001', 2),
  ('No. Handphone', 'tel',      true,  '', '08xxxxxxxxxx', 3),
  ('Pilihan Minat', 'select',   true,  E'Akademik\nMinat & Bakat\nHumas\nPublikasi, Desain & Dokumentasi', '', 4),
  ('Pesan',         'textarea', false, '', 'Ceritakan motivasi Anda bergabung (opsional)', 5)
) as v(label, type, required, options, placeholder, sort)
where not exists (select 1 from form_fields);

-- ---------------------------------------------------------------------
-- Storage: bucket publik "media" (hanya BACA publik; upload hanya lewat server)
-- Dibatasi 4 MB per file dan tipe file tertentu saja.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 4194304,
  array['image/jpeg','image/png','image/gif','image/webp','image/avif','image/svg+xml','image/x-icon','image/vnd.microsoft.icon','application/pdf','application/zip'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Storage PRIVAT untuk file yang diunggah calon anggota (tipe isian "Upload File").
-- public = false -> tidak punya URL publik; hanya server (service_role) yang bisa membaca.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registrations', 'registrations', false, 2097152,
  array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Muat ulang cache skema API agar tabel/izin baru langsung terbaca
notify pgrst, 'reload schema';
