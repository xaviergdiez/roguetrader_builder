import React, { useEffect, useRef } from 'react';
import { curtain } from './gsapcdn.js';

/* Black over the table's screen while a scene is changed under it, so the
   table sees a fade rather than a deck being redrawn. Faded by GSAP when it
   is here (gsapcdn.js); otherwise, or for anyone who asks for less motion,
   it is simply there and then gone. */
export default function Curtain({ down = false }) {
  const ref = useRef(null);
  useEffect(() => { curtain(ref.current, down); }, [down]);
  return <div ref={ref} className="rt-curtain" aria-hidden="true" />;
}
