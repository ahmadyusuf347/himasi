// Perkecil foto album di browser (maks 1600px, JPEG) agar total upload kecil (batas request Vercel 4,5 MB)
async function shrink(f, maxPx = 1600, quality = .82) {
  if (!f.type.startsWith('image/') || /gif|svg/.test(f.type)) return f;
  try {
    const b = await createImageBitmap(f), k = Math.min(1, maxPx / Math.max(b.width, b.height)), c = document.createElement('canvas');
    c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}
document.querySelectorAll('input[type=file][multiple]').forEach(inp => inp.addEventListener('change', async () => {
  const info = inp.parentElement.querySelector('[data-size]'); if (info) info.textContent = 'Memproses foto...';
  const dt = new DataTransfer(); let total = 0;
  for (const f of inp.files) { const s = await shrink(f); total += s.size; dt.items.add(s); }
  inp.files = dt.files;
  if (info) info.textContent = dt.files.length + ' foto siap diupload (' + (total / 1048576).toFixed(1) + ' MB)' + (total > 4 * 1048576 ? ' - terlalu besar, kurangi jumlah foto per simpan.' : '');
}));

document.addEventListener('submit', e => { const m = e.target.dataset && e.target.dataset.confirm; if (m && !confirm(m)) e.preventDefault(); });

// Gambar tunggal besar (mis. bagan struktur): bila > 3,5 MB, perkecil ke maks. 2400 px agar lolos batas upload Vercel
document.querySelectorAll('input[type=file][data-shrink]').forEach(inp => inp.addEventListener('change', async () => {
  const f = inp.files[0], info = inp.parentElement.querySelector('[data-size]'); if (!f) return;
  let out = f; if (f.size > 3.5 * 1048576 && /^image\/(jpeg|png|webp)$/.test(f.type)) { if (info) info.textContent = 'Memperkecil gambar...'; out = await shrink(f, 2400, .88); }
  if (out !== f) { const dt = new DataTransfer(); dt.items.add(out); inp.files = dt.files; }
  if (info) info.textContent = out.name + ' (' + (out.size / 1048576).toFixed(1) + ' MB)' + (out.size > 4 * 1048576 ? ' - masih terlalu besar (maks. 4 MB), gunakan gambar lebih kecil.' : '');
}));
