/* GSAP, from the CDN, loaded once into the app's own window.

   It animates what is laid over the table's screen (a handout arriving, the
   curtain between two scenes, a trigger's banner) and runs the frame loop of
   the map drawn in this window.

   ONE COPY, IN THIS WINDOW. The table's map is painted into a second window
   through a portal (MapWindow.jsx), and a script added to that window's blank
   document is never fetched, so GSAP cannot be loaded there. It does not need
   to be: GSAP here tweens elements in the other window as readily as its own.
   What it must not do is run that window's FRAMES: its ticker runs on this
   window's requestAnimationFrame, which stops whenever this window is hidden
   behind the projector's. So the map in the other window keeps its own
   window's frames (runFrames), and only the map drawn here rides the ticker.

   AND NEVER REQUIRED, OR WAITED ON. A table may have no internet, and a
   script that neither loads nor fails would otherwise hold everything waiting
   on it. Every caller gets null, in time, when GSAP is not to be had, and does
   the same thing without it: plain frames, an overlay that simply appears.

   Pinned to one version with its integrity hash, so the browser refuses a
   file that is not the one checked here. */

export const GSAP_VERSION = '3.12.5';
export const GSAP_URL = `https://cdnjs.cloudflare.com/ajax/libs/gsap/${GSAP_VERSION}/gsap.min.js`;
export const GSAP_INTEGRITY = 'sha512-7eHRwcbYkK4d9g/6tD/mhkf++eoTHwpNM9woBxtPUBWm67zeAfFC+HrdoE2GanKeocly/VxeLvIqwvCdk7qScg==';
// Past this the CDN is not answering, and the table goes on without it.
export const GSAP_WAIT_MS = 5000;

const home = () => (typeof window === 'undefined' ? null : window);
let loading = null;

// This window's gsap, or null when it cannot be had in time.
export function loadGsap() {
  const w = home();
  if (!w || !w.document) return Promise.resolve(null);
  if (w.gsap) return Promise.resolve(w.gsap);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = w.document.createElement('script');
    const settle = (g) => { clearTimeout(timer); resolve(g); };
    const timer = setTimeout(() => { loading = null; settle(null); }, GSAP_WAIT_MS);
    s.src = GSAP_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.integrity = GSAP_INTEGRITY;
    s.onload = () => settle(w.gsap || null);
    // Forgotten, so a later call may try again once the network is back.
    s.onerror = () => { loading = null; s.remove(); settle(null); };
    w.document.head.appendChild(s);
  });
  return loading;
}

// GSAP now, if it has already arrived; asked for otherwise, for next time.
export function gsapNow() {
  const w = home();
  if (w && w.gsap) return w.gsap;
  loadGsap();
  return null;
}

/* Calls `tick(ms)` about every `everyMs` until stopped. The map in THIS
   window rides GSAP's ticker once it is here (plain frames until then); a map
   in another window always runs on that window's own frames. Returns the
   function that stops it. */
export function runFrames(w, everyMs, tick) {
  let stopped = false;
  let last = -Infinity;
  const step = (ms) => {
    if (ms - last >= everyMs) { last = ms; tick(ms); }
  };
  let id = 0;
  const loop = (t) => { step(t); id = w.requestAnimationFrame(loop); };
  id = w.requestAnimationFrame(loop);
  let stop = () => w.cancelAnimationFrame(id);
  if (w === home()) {
    loadGsap().then((gsap) => {
      if (stopped || !gsap || !gsap.ticker) return;
      w.cancelAnimationFrame(id);
      const fn = (time) => step(time * 1000);
      gsap.ticker.add(fn);
      stop = () => gsap.ticker.remove(fn);
    });
  }
  return () => { stopped = true; stop(); };
}

const reducedIn = (w) => Boolean(w && w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* An element arriving: a short fade and settle with GSAP, at once without
   it or for anyone who asks for less motion. */
export function reveal(el, { from = 0.96 } = {}) {
  if (!el) return;
  const gsap = gsapNow();
  if (!gsap || reducedIn(el.ownerDocument.defaultView)) return;
  gsap.fromTo(el, { autoAlpha: 0, scale: from }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
}

/* The curtain, down or up. Not waited on: a scene changes under it on a
   timer, so if GSAP is not already here the curtain simply drops. */
export function curtain(el, down) {
  if (!el) return;
  const gsap = gsapNow();
  if (!gsap || reducedIn(el.ownerDocument.defaultView)) {
    el.style.opacity = down ? '1' : '0';
    el.style.visibility = down ? 'visible' : 'hidden';
    return;
  }
  gsap.to(el, { autoAlpha: down ? 1 : 0, duration: 0.4, ease: down ? 'power1.in' : 'power1.out', overwrite: 'auto' });
}
