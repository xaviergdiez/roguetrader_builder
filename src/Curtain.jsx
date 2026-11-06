import React, { useEffect, useRef } from 'react';
import { loadGsap } from './gsapcdn.js';

/* Black over the table's screen while a scene is changed under it, so the
   table sees a fade rather than a deck being redrawn. Faded by the GSAP of
   the window it is in; without GSAP, or for anyone who asks for less motion,
   it is simply there and then gone. */
export default function Curtain({ down = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.ownerDocument.defaultView;
    const plain = () => { el.style.opacity = down ? '1' : '0'; el.style.visibility = down ? 'visible' : 'hidden'; };
    loadGsap(w).then((gsap) => {
      const reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!gsap || reduced) { plain(); return; }
      gsap.to(el, { autoAlpha: down ? 1 : 0, duration: 0.4, ease: down ? 'power1.in' : 'power1.out', overwrite: 'auto' });
    });
  }, [down]);
  return <div ref={ref} className="rt-curtain" aria-hidden="true" />;
}
