import React, { useEffect, useRef } from 'react';
import { kindById, handoutLabel } from './handouts.js';
import { reveal } from './gsapcdn.js';

/* One handout, dressed as what it is: a data-slate's green screen, a vox
   log's amber print, an astropath's message, a pict, a sealed missive. The
   same drawing on the table's screen, in the GM's preview and in a player's
   hand, so what the GM prepares is what the table sees. */

// The kind's own heading, the way the thing itself would print it.
const HEADS = {
  dataslate: '++ DATA-SLATE ++',
  vox: '++ VOX INTERCEPT ++',
  astropath: '+ ASTROPATHIC TRANSMISSION +',
  pict: 'PICT-CAPTURE',
  missive: ''
};

export default function HandoutView({ handout, image = null, big = false, animate = false, children = null }) {
  const ref = useRef(null);
  useEffect(() => {
    if (animate && ref.current) reveal(ref.current);
  }, [animate, handout && handout.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!handout) return null;
  const kind = kindById(handout.kind);
  return (
    <article ref={ref} className={`rt-ho rt-ho-${kind.id}${big ? ' big' : ''}`} aria-label={`${kind.name}: ${handoutLabel(handout)}`}>
      {HEADS[kind.id] ? <div className="rt-ho-head">{HEADS[kind.id]}</div> : null}
      {handout.title ? <h3 className="rt-ho-title">{handout.title}</h3> : null}
      {image ? <img className="rt-ho-img" src={image} alt={handout.title || kind.name} /> : null}
      {handout.text ? <div className="rt-ho-text">{handout.text}</div> : null}
      {kind.id === 'missive' ? <div className="rt-ho-seal" aria-hidden="true" /> : null}
      {children}
    </article>
  );
}

/* Read out in a vox voice: the speech the browser has, pitched down and
   slowed the way the Vox-Synthesiser's Magos profile is. */
export function speakVox(text, { win = null } = {}) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || !('speechSynthesis' in w) || !text || !String(text).trim()) return false;
  w.speechSynthesis.cancel();
  const u = new w.SpeechSynthesisUtterance(String(text));
  u.pitch = 0.55;
  u.rate = 0.8;
  w.speechSynthesis.speak(u);
  return true;
}
