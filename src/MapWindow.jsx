import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/* A second browser window that renders part of this React tree.

   The map wants a screen of its own — a projector, or the far half of the
   GM's desk — while the dashboard and the bridge data stay where they are.
   The obvious way to do that is a second copy of the app at its own URL,
   which immediately needs the two copies kept in step: a channel, a storage
   event, a reducer on both ends, and a race whenever the GM paints a cell in
   one and measures in the other.

   A portal avoids all of it. There is ONE React tree and ONE piece of state;
   the popup is just another place to paint it. Nothing is serialised,
   nothing is synchronised, and the map cannot disagree with itself. */

export default function MapWindow({ title = 'Battle map', width = 1400, height = 900, onClose, children }) {
  const [container, setContainer] = useState(null);

  useEffect(() => {
    // Opened at the size of the screen it was opened from, not a fixed
    // 1400x900. On a Mac a script cannot put a popup into a full-screen
    // Space; the nearest it gets is a window that already fills the usable
    // screen, and the map's own Full screen button (or F) does the rest from
    // inside, where the browser will accept a keypress as permission.
    const scr = window.screen || {};
    const sw = Math.max(800, scr.availWidth || width);
    const sh = Math.max(600, scr.availHeight || height);
    const left = scr.availLeft || 0;
    const top = scr.availTop || 0;
    const w = window.open('', 'rt-battlemap',
      `popup=yes,width=${sw},height=${sh},left=${left},top=${top}`);
    // Blocked, almost always because the open did not come from a click.
    // Say so rather than silently rendering nothing.
    if (!w) { if (onClose) onClose('blocked'); return undefined; }

    w.document.title = title;
    // Some browsers ignore the size in the features string for a popup that
    // already exists (the name is reused), so ask again.
    try { w.moveTo(left, top); w.resizeTo(sw, sh); } catch { /* refused */ }

    // A popup starts with an empty document and inherits no styling, so the
    // app's stylesheet is cloned across. Cloned, not moved: the original is
    // still styling the window we came from.
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
      w.document.head.appendChild(node.cloneNode(true));
    }
    const body = w.document.body;
    // EVERY colour, border and font in this app is a custom property declared
    // on .rt-root, and a popup's body has no ancestor carrying it. Without
    // this the stylesheet clones across and still renders nothing: the rules
    // match, but every var() resolves to empty, so borders and backgrounds
    // vanish while the font and letter-spacing survive — which looks like the
    // styles failed to copy rather than like a missing class.
    body.className = 'rt-root rt-mapwin';
    body.style.margin = '0';
    body.style.padding = '10px';
    body.style.background = '#05070a';
    setContainer(body);

    // The GM closing the window is the same as pressing the button here, or
    // the panel would keep claiming a window that is gone.
    const closed = () => { if (onClose) onClose(); };
    w.addEventListener('beforeunload', closed);
    // And a popup must not outlive the window that opened it — orphaned, it
    // renders nothing and cannot be reopened into.
    const closePopup = () => w.close();
    window.addEventListener('beforeunload', closePopup);

    return () => {
      w.removeEventListener('beforeunload', closed);
      window.removeEventListener('beforeunload', closePopup);
      setContainer(null);
      w.close();
    };
    // Opened once, for the life of the component. Resizing it afterwards is
    // the GM's business, not React's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!container) return null;
  // The popup's own window, so anything inside can bind keys and listeners
  // to the window the user is actually looking at rather than this one.
  return createPortal(
    typeof children === 'function' ? children(container.ownerDocument.defaultView) : children,
    container
  );
}
