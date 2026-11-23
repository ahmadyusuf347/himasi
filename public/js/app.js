document.addEventListener('DOMContentLoaded', () => {
  gsap.registerPlugin(ScrollTrigger);
  const ck = document.getElementById('clock');
  if (ck) { let df, tf; try { df = new Intl.DateTimeFormat('id-ID', { timeZone: ck.dataset.tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); tf = new Intl.DateTimeFormat('id-ID', { timeZone: ck.dataset.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch {}
    if (df) { const d = ck.querySelector('[data-d]'), t = ck.querySelector('[data-t]'), tick = () => { const n = new Date(); d.textContent = df.format(n); t.textContent = tf.format(n).replace(/\./g, ':'); }; tick(); setInterval(tick, 1000); } }
  const nav = document.getElementById('nav');
  const tt = document.getElementById('toTop');
  if (tt) tt.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  if (nav || tt) { const f = () => { nav && nav.classList.toggle('is-stuck', scrollY > 20); tt && tt.classList.toggle('show', scrollY > 500); }; addEventListener('scroll', f, { passive: true }); f(); }
  const sl = document.getElementById('slider');
  if (sl) {
    const slides = [...sl.querySelectorAll('[data-slide]')], fills = [...sl.querySelectorAll('[data-fill]')], dots = [...sl.querySelectorAll('[data-dot]')];
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches; let i = 0, tw;
    const go = n => {
      if (n !== i) { gsap.to(slides[i], { autoAlpha: 0, duration: .5 }); gsap.fromTo(slides[n], { autoAlpha: 0 }, { autoAlpha: 1, duration: .6, delay: .15 });
        if (!rm) gsap.fromTo(slides[n].querySelectorAll('.s-in'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: .1, duration: .7, delay: .2 }); }
      fills.forEach((f, k) => gsap.set(f, { width: '0%' })); i = n; tw && tw.kill();
      if (!rm && slides.length > 1) tw = gsap.fromTo(fills[n], { width: '0%' }, { width: '100%', duration: 6, ease: 'none', onComplete: () => go((n + 1) % slides.length) });
      else if (fills[n]) gsap.set(fills[n], { width: '100%' });
    };
    dots.forEach((d, k) => d.addEventListener('click', () => go(k)));
    sl.addEventListener('mouseenter', () => tw && tw.pause()); sl.addEventListener('mouseleave', () => tw && tw.play());
    go(0);
    if (!rm) gsap.from(slides[0].querySelectorAll('.s-in'), { y: 30, opacity: 0, stagger: .12, duration: .8, ease: 'power3.out' });
  }
  const dr = document.getElementById('drawer'), ov = document.getElementById('overlay');
  const open = () => { ov.classList.remove('hidden'); gsap.to(ov, { opacity: 1, duration: .3 }); gsap.to(dr, { xPercent: 0, x: 0, duration: .45, ease: 'power3.out' });
    gsap.from('#drawer .dl', { x: 30, opacity: 0, stagger: .06, delay: .15, duration: .4 }); document.body.style.overflow = 'hidden'; };
  const close = () => { gsap.to(dr, { xPercent: 100, duration: .3, ease: 'power2.in' });
    gsap.to(ov, { opacity: 0, duration: .3, onComplete: () => ov.classList.add('hidden') }); document.body.style.overflow = ''; };
  if (dr) { gsap.set(dr, { xPercent: 100, x: 0 });
    ['menuBtn'].forEach(i => document.getElementById(i)?.addEventListener('click', open));
    document.getElementById('menuClose')?.addEventListener('click', close); ov.addEventListener('click', close);
    window.addEventListener('resize', () => { const b = document.getElementById('menuBtn'); if (b && getComputedStyle(b).display === 'none' && !ov.classList.contains('hidden')) close(); }); }
  
  document.querySelectorAll('[data-scroll]').forEach(b => b.addEventListener('click', () => { const m = document.getElementById('more'); m.scrollBy({ left: m.clientWidth * .9 * b.dataset.scroll, behavior: 'smooth' }); }));
  // Lightbox galery (slider album)
  const lb = document.getElementById('lb');
  if (lb) {
    const img = lb.querySelector('[data-lb-img]'), cnt = lb.querySelector('[data-lb-count]'), ttl = lb.querySelector('[data-lb-title]');
    const prev = lb.querySelector('[data-lb-prev]'), next = lb.querySelector('[data-lb-next]'); let list = [], idx = 0, tx = 0;
    const rmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = (n, dir = 0) => { idx = (n + list.length) % list.length; img.src = list[idx]; cnt.textContent = list.length > 1 ? (idx + 1) + ' / ' + list.length : '';
      if (!rmo && dir) gsap.fromTo(img, { opacity: 0, x: 50 * dir }, { opacity: 1, x: 0, duration: .35, ease: 'power2.out' }); };
    const open = (l, t) => { list = l; ttl.textContent = t || ''; prev.hidden = next.hidden = l.length < 2; lb.classList.remove('hidden'); document.body.style.overflow = 'hidden'; show(0);
      if (!rmo) gsap.from(lb, { opacity: 0, duration: .25 }); };
    const close = () => { lb.classList.add('hidden'); document.body.style.overflow = ''; img.src = ''; };
    document.querySelectorAll('[data-photos]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); let l = []; try { l = JSON.parse(a.dataset.photos); } catch {} if (l.length) open(l, a.dataset.title); }));
    prev.addEventListener('click', e => { e.stopPropagation(); show(idx - 1, -1); }); next.addEventListener('click', e => { e.stopPropagation(); show(idx + 1, 1); });
    lb.querySelector('[data-lb-close]').addEventListener('click', close);
    lb.addEventListener('click', e => { if (e.target === lb || e.target.dataset.lbStage !== undefined) close(); });
    addEventListener('keydown', e => { if (lb.classList.contains('hidden')) return; if (e.key === 'Escape') close(); if (list.length > 1 && e.key === 'ArrowLeft') show(idx - 1, -1); if (list.length > 1 && e.key === 'ArrowRight') show(idx + 1, 1); });
    lb.addEventListener('touchstart', e => { tx = e.changedTouches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - tx; if (list.length > 1 && Math.abs(d) > 50) show(idx + (d < 0 ? 1 : -1), d < 0 ? 1 : -1); }, { passive: true });
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.from('.hero-in', { y: 30, opacity: 0, duration: .9, stagger: .15, ease: 'power3.out' });
  gsap.utils.toArray('[data-reveal]').forEach(el => gsap.from(el, { y: 40, opacity: 0, duration: .8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%' } }));
});
