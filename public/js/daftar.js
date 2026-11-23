// Pemeriksaan file di sisi pengunjung (server tetap memeriksa ulang). Foto besar diperkecil otomatis.
async function shrink(f, max) {
  try {
    const b = await createImageBitmap(f); let k = Math.min(1, 1600 / Math.max(b.width, b.height)), blob;
    for (let q = .85; q > .4; q -= .15) {
      const c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0, c.width, c.height);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); if (blob && blob.size <= max) break; k *= .8;
    }
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}
document.querySelectorAll('input[type=file][data-max]').forEach(inp => inp.addEventListener('change', async () => {
  const f = inp.files[0]; if (!f) return;
  const max = +inp.dataset.max, ex = inp.dataset.exts.split(','), ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!ex.includes(ext)) { alert('Format file tidak diizinkan. Gunakan: ' + ex.filter(e => e !== 'jpeg').join(', ').toUpperCase()); inp.value = ''; return; }
  let out = f;
  if (f.size > max && /^image\//.test(f.type) && ex.includes('jpg')) out = await shrink(f, max);
  if (out.size > max) { alert('Ukuran file terlalu besar (maksimal ' + (max / 1048576) + ' MB).'); inp.value = ''; return; }
  if (out !== f) { const dt = new DataTransfer(); dt.items.add(out); inp.files = dt.files; }
}));
