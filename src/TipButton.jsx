import React, { useRef, useState } from 'react';

/* A button that is only a picture, with its name under the pointer.

   Shared by the battle map and the void chart. Both drew their own icon
   buttons and both leaned on the browser's `title`, which waits about a
   second and arrives in system grey — long enough that a GM mid-session
   guesses at a row of icons rather than reading them. The tooltip is drawn
   here instead, at once, in the app's own type; `title` stays for the screen
   reader and for anyone who waits.

   The glyph is passed in rather than named, because the two maps have
   different icon sets and only the BUTTON is worth sharing.

   The tooltip is nudged sideways when it would run off the window: a toolbar
   wraps, so a button regularly ends a row hard against an edge and a centred
   tooltip would hang half its text outside the glass. The nudge is worked out
   from where the tooltip WOULD sit, centred on the button, rather than from
   where it currently sits — an incremental correction looks the same in one
   pass and doubles in two, which once pushed a tooltip 182px when 91 was the
   whole fix and left it nowhere near its own icon. */
export default function TipButton({
  children, label, onClick, on = false, disabled = false, className = '', tip = true
}) {
  const tipRef = useRef(null);
  const [shift, setShift] = useState(0);
  const place = (e) => {
    const btn = e.currentTarget;
    const el = tipRef.current;
    if (!el) return;
    const view = btn.ownerDocument.defaultView || window;
    const b = btn.getBoundingClientRect();
    // The width is the one measurement the shift cannot affect — and it is
    // the real width, so a two-word label is not moved as if it were a
    // sentence. Hidden with visibility rather than display precisely so
    // there is a box to measure before anyone has seen it.
    const half = el.getBoundingClientRect().width / 2;
    const mid = b.left + b.width / 2;
    const pad = 8;
    let want = 0;
    if (mid + half > view.innerWidth - pad) want = (view.innerWidth - pad) - (mid + half);
    if (mid - half + want < pad) want = pad - (mid - half);
    setShift(Math.round(want));
  };
  return (
    <button type="button" className={'rt-ico-btn' + (on ? ' on' : '') + (className ? ' ' + className : '')}
      title={label} aria-label={label} aria-pressed={on || undefined}
      disabled={disabled} onClick={onClick}
      onMouseEnter={tip ? place : undefined} onFocus={tip ? place : undefined}
      // Measured again next time rather than kept: the window may have been
      // resized, or the bar rewrapped, since this one was placed.
      onMouseLeave={() => setShift(0)} onBlur={() => setShift(0)}>
      {children}
      {tip && (
        <span className="rt-ico-tip" ref={tipRef} aria-hidden="true"
          style={{ '--tip-shift': shift + 'px' }}>{label}</span>
      )}
    </button>
  );
}
