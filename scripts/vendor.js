// Menyalin GSAP & Bootstrap Icons dari node_modules ke public/vendor (di-host sendiri, tanpa CDN pihak ketiga)
const fs = require('fs'), path = require('path');
const nm = p => path.join(__dirname, '..', 'node_modules', p), out = p => path.join(__dirname, '..', 'public', 'vendor', p);
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.cpSync(a, b, { recursive: true }); };
try {
  cp(nm('gsap/dist/gsap.min.js'), out('gsap.min.js')); cp(nm('gsap/dist/ScrollTrigger.min.js'), out('ScrollTrigger.min.js'));
  cp(nm('bootstrap-icons/font/bootstrap-icons.min.css'), out('bootstrap-icons/bootstrap-icons.min.css')); cp(nm('bootstrap-icons/font/fonts'), out('bootstrap-icons/fonts'));
} catch (e) { console.error('vendor.js gagal:', e.message); process.exit(1); }
