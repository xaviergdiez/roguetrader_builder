import { useEffect, useRef, useState } from 'react';
import { getLocalFile } from './localfiles.js';

/* A picture floor's file, decoded for drawing: shared by the boarding map and
   the void chart (backdrop.js says what a picture floor is).

   The file is in this browser's own store, not on the deck or the chart (see
   localfiles.js), so it is looked up by the id the record carries and decoded
   here: an image, or a video playing muted on a loop. Each window drawing it
   decodes its own, which is what lets the projector's copy go on playing while
   the dashboard is behind it. `probeOnly` asks only whether the file is here,
   for a copy of the controls that draws nothing.

   Answers { mediaRef, state, tick, reload }: the decoded { id, kind, el, url,
   width, height } in a ref (drawn every frame, so not state), whether it is
   'none' | 'loading' | 'ready' | 'missing', a number that changes when it
   arrives, and a way to read the file again after it was chosen afresh. */
export default function useBackdropMedia(backdrop, { win = null, probeOnly = false, reducedMotion = false } = {}) {
  const mediaRef = useRef(null);
  const [state, setState] = useState('none');
  const [tick, setTick] = useState(0);
  const [ask, setAsk] = useState(0);

  const drop = () => {
    const old = mediaRef.current;
    mediaRef.current = null;
    if (!old) return;
    if (old.kind === 'video' && old.el) { try { old.el.pause(); } catch { /* gone */ } old.el.remove(); }
    if (old.url) URL.revokeObjectURL(old.url);
  };

  const id = backdrop ? backdrop.id : null;
  const kind = backdrop ? backdrop.kind : null;
  useEffect(() => {
    if (mediaRef.current && mediaRef.current.id !== id) drop();
    if (!id) { setState('none'); return undefined; }
    if (mediaRef.current && mediaRef.current.id === id) return undefined;
    let cancelled = false;
    setState('loading');
    getLocalFile(id).then((rec) => {
      if (cancelled) return;
      if (!rec || !rec.blob) { setState('missing'); return; }
      if (probeOnly) { setState('ready'); return; }
      const w = win || window;
      const url = URL.createObjectURL(rec.blob);
      const done = (el, width, height) => {
        if (cancelled) { URL.revokeObjectURL(url); if (kind === 'video') el.remove(); return; }
        mediaRef.current = { id, kind, el, url, width, height };
        setState('ready');
        setTick((t) => t + 1);
      };
      const fail = () => { URL.revokeObjectURL(url); if (!cancelled) setState('missing'); };
      if (kind === 'image') {
        const img = new w.Image();
        img.onload = () => done(img, img.naturalWidth, img.naturalHeight);
        img.onerror = fail;
        img.src = url;
        return;
      }
      /* In the document of the window that draws it, and IN the document:
         a browser may stop decoding a video it cannot find on any page. It is
         a pixel, out of the way and out of reach of the pointer. */
      const v = w.document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = !reducedMotion;
      v.setAttribute('aria-hidden', 'true');
      Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none' });
      v.onloadeddata = () => {
        done(v, v.videoWidth, v.videoHeight);
        if (!reducedMotion) v.play().catch(() => {});
      };
      v.onerror = fail;
      // A file with no length in it (a browser recording, some exports) can
      // stop at its end with `loop` set: start it again by hand.
      v.onended = () => { v.currentTime = 0; if (!reducedMotion) v.play().catch(() => {}); };
      w.document.body.appendChild(v);
      v.src = url;
    }).catch(() => { if (!cancelled) setState('missing'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ask, win, probeOnly]);
  useEffect(() => () => drop(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  return {
    mediaRef, state, tick,
    // The same id, with a file just chosen for it: read it again.
    reload: () => { drop(); setAsk((n) => n + 1); }
  };
}
