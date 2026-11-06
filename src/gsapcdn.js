/* GSAP, from the CDN, into whichever window asks for it.

   GSAP runs the map's frame loop (its ticker, with lag smoothing) and the
   animations of the things laid over it: a handout arriving on the table's
   screen, a trigger's banner, the fade between two scenes.

   PER WINDOW, NOT ONCE. The table's map is painted into a second window
   through a portal (MapWindow.jsx), and GSAP's ticker runs on the
   requestAnimationFrame of the window that loaded it. Loaded only into the
   dashboard, it would stop whenever the dashboard is hidden behind the
   projector's window, which at the table is most of the time. So each window
   gets its own copy, loaded into its own document, and anything animating in
   the popup uses the popup's.

   AND NEVER REQUIRED. A table may have no internet. Every caller is handed
   null when the script cannot be had, and falls back to doing the same thing
   without it: the plain frame loop, an overlay that simply appears.

   Pinned to one version with its integrity hash, so the browser refuses a
   file that is not the one checked here. */

export const GSAP_VERSION = '3.12.5';
export const GSAP_URL = `https://cdnjs.cloudflare.com/ajax/libs/gsap/${GSAP_VERSION}/gsap.min.js`;
export const GSAP_INTEGRITY = 'sha512-7eHRwcbYkK4d9g/6tD/mhkf++eoTHwpNM9woBxtPUBWm67zeAfFC+HrdoE2GanKeocly/VxeLvIqwvCdk7qScg==';

const loading = new WeakMap();

// That window's gsap, or null when it cannot be loaded.
export function loadGsap(w = typeof window === 'undefined' ? null : window) {
  if (!w || !w.document) return Promise.resolve(null);
  if (w.gsap) return Promise.resolve(w.gsap);
  if (loading.has(w)) return loading.get(w);
  const p = new Promise((resolve) => {
    const s = w.document.createElement('script');
    s.src = GSAP_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.integrity = GSAP_INTEGRITY;
    s.onload = () => resolve(w.gsap || null);
    // Forgotten, so a later call may try again once the network is back.
    s.onerror = () => { loading.delete(w); s.remove(); resolve(null); };
    w.document.head.appendChild(s);
  });
  loading.set(w, p);
  return p;
}

/* Calls `tick(ms)` about every `everyMs`, on the window's GSAP ticker when
   GSAP is there and on its own requestAnimationFrame when it is not. Returns
   the function that stops it. */
export function runFrames(w, everyMs, tick) {
  let stopped = false;
  let stop = () => {};
  let last = -Infinity;
  const step = (ms) => {
    if (ms - last >= everyMs) { last = ms; tick(ms); }
  };
  loadGsap(w).then((gsap) => {
    if (stopped) return;
    if (gsap && gsap.ticker) {
      const fn = (time) => step(time * 1000);
      gsap.ticker.add(fn);
      stop = () => gsap.ticker.remove(fn);
      return;
    }
    let id = 0;
    const loop = (t) => { step(t); id = w.requestAnimationFrame(loop); };
    id = w.requestAnimationFrame(loop);
    stop = () => w.cancelAnimationFrame(id);
  });
  return () => { stopped = true; stop(); };
}

const reduced = (w) => Boolean(w && w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* An element arriving or leaving: a short fade and settle with GSAP, at once
   without it or for anyone who asks for less motion. */
export function reveal(el, { w = null, from = 0.96 } = {}) {
  if (!el) return;
  const win = w || el.ownerDocument.defaultView;
  loadGsap(win).then((gsap) => {
    if (!gsap || reduced(win)) { el.style.visibility = 'inherit'; el.style.opacity = '1'; return; }
    gsap.fromTo(el, { autoAlpha: 0, scale: from }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
  });
}

export function conceal(el, { w = null, done = null } = {}) {
  if (!el) { if (done) done(); return; }
  const win = w || el.ownerDocument.defaultView;
  loadGsap(win).then((gsap) => {
    if (!gsap || reduced(win)) { if (done) done(); return; }
    gsap.to(el, { autoAlpha: 0, duration: 0.3, ease: 'power1.in', overwrite: 'auto', onComplete: () => { if (done) done(); } });
  });
}
