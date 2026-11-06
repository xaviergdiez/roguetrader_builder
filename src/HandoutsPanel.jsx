import React, { useEffect, useRef, useState } from 'react';
import {
  HANDOUT_KINDS, kindById, readHandout, readHandouts, newHandout, handoutLabel,
  MAX_TITLE, MAX_TEXT, MAX_HANDOUTS, MAX_HANDOUT_IMAGE
} from './handouts.js';
import { readBridge, sendHandout, withdrawHandout, readHandoutImage } from './bridge.js';
import { putLocalFile, getLocalFile } from './localfiles.js';
import { shrinkToDataUrl } from './imageshrink.js';
import HandoutView, { speakVox } from './HandoutView.jsx';

/* A handout's picture, from this browser, as a URL an <img> can show. */
export function useLocalPicture(fileId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!fileId) { setUrl(null); return undefined; }
    let made = null;
    let cancelled = false;
    getLocalFile(fileId).then((rec) => {
      if (cancelled || !rec || !rec.blob) { if (!cancelled) setUrl(null); return; }
      made = URL.createObjectURL(rec.blob);
      setUrl(made);
    }).catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [fileId]);
  return url;
}

/* The picture made small enough to send: a 1024px JPEG, or smaller again if
   that is still past what the table may carry. */
async function pictureToSend(fileId) {
  const rec = await getLocalFile(fileId);
  if (!rec || !rec.blob) return null;
  for (const [max, q] of [[1024, 0.82], [768, 0.75], [512, 0.7]]) {
    const url = await shrinkToDataUrl(rec.blob, max, q);
    if (url.length <= MAX_HANDOUT_IMAGE) return url;
  }
  return null;
}

/* THE GM'S HANDOUTS: written ahead, shown on the table's screen, handed to a
   player or to the whole table. Kept in the GM's library with the rest of
   their homebrew; a picture stays in this browser. */
export default function HandoutsPanel({ homebrew, setHomebrew, bridgeCode = null, showing = null, onShow, onHide }) {
  const list = readHandouts(homebrew && homebrew.handouts);
  const [openId, setOpenId] = useState(list.length ? list[0].id : null);
  const cur = list.find((h) => h.id === openId) || null;
  const picture = useLocalPicture(cur && cur.image);
  const [table, setTable] = useState(null);       // { members, handouts } on the bridge
  const [to, setTo] = useState('all');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const save = (next) => setHomebrew((h) => ({ ...(h || {}), handouts: next }));
  const update = (id, patch) => save(list.map((h) => (h.id === id ? readHandout({ ...h, ...patch }) : h)));
  const add = (kind) => {
    if (list.length >= MAX_HANDOUTS) { setNote(`The library holds ${MAX_HANDOUTS} handouts. Take one out first.`); return; }
    const h = newHandout(kind);
    save([h, ...list]);
    setOpenId(h.id);
  };
  const remove = (id) => {
    const h = list.find((x) => x.id === id);
    if (!h || !window.confirm(`Take “${handoutLabel(h)}” out of the library? Anything already handed over stays with the players.`)) return;
    save(list.filter((x) => x.id !== id));
    if (openId === id) setOpenId(null);
  };
  const choosePicture = async (file) => {
    if (!file || !cur) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { setNote('That is not a picture this can show.'); return; }
    const id = 'hpic-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { await putLocalFile(id, file, { name: file.name }); } catch {
      setNote('This browser would not keep the picture. A private window keeps nothing.');
      return;
    }
    update(cur.id, { image: id, imageName: file.name });
  };

  // Who is at the table, and what they already hold, read from the bridge.
  const loadTable = async () => {
    if (!bridgeCode) { setTable(null); return; }
    try {
      const r = await readBridge({ code: bridgeCode });
      if (!r) return;
      setTable({
        members: ((r.dynasty && r.dynasty.members) || []).filter((m) => m.charId && !m.npc),
        handouts: (r.ship && r.ship.handouts) || []
      });
    } catch (e) { setTable(null); setNote(e.message || 'Could not reach the bridge.'); }
  };
  useEffect(() => { loadTable(); }, [bridgeCode]);   // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!cur || !bridgeCode) return;
    setBusy(true);
    setNote('');
    try {
      const image = cur.image ? await pictureToSend(cur.image) : null;
      if (cur.image && !image) setNote('The picture would not go: it is not on this computer. The words went without it.');
      const r = await sendHandout({
        code: bridgeCode, to: to === 'all' ? 'all' : [to],
        kind: cur.kind, title: cur.title, text: cur.text, image
      });
      setTable((t) => ({ ...(t || { members: [] }), handouts: (r.ship && r.ship.handouts) || [] }));
      const who = to === 'all' ? 'everyone at the table'
        : ((table && table.members.find((m) => m.charId === to)) || {}).name || 'them';
      setNote((n) => n || `Handed to ${who}.`);
    } catch (e) {
      setNote(e.message || 'The bridge refused it.');
    } finally { setBusy(false); }
  };
  const withdraw = async (id) => {
    try {
      const r = await withdrawHandout({ code: bridgeCode, id });
      setTable((t) => ({ ...(t || { members: [] }), handouts: (r.ship && r.ship.handouts) || [] }));
    } catch (e) { setNote(e.message || 'The bridge refused it.'); }
  };
  const nameOf = (charId) => ((table && table.members.find((m) => m.charId === charId)) || {}).name || 'someone';

  return (
    <div className="rt-hos">
      <div className="rt-conds-h">Handouts</div>
      <p className="rt-vox-hint">
        Written ahead: a data-slate off a body, an intercepted vox log, an astropath{'’'}s message, a pict of the
        suspect, a sealed writ. Show one on the table{'’'}s screen, or hand it to a player or the whole table, where
        it stays in their hands.
      </p>
      <div className="rt-btnrow">
        {HANDOUT_KINDS.map((k) => (
          <button key={k.id} type="button" className="rt-btn" title={k.note} onClick={() => add(k.id)}>New {k.name.toLowerCase()}</button>
        ))}
      </div>

      {list.length > 0 && (
        <div className="rt-hos-body">
          <ul className="rt-hos-list" role="listbox" aria-label="Your handouts">
            {list.map((h) => (
              <li key={h.id}>
                <button type="button" role="option" aria-selected={h.id === openId}
                  className={'rt-hos-item' + (h.id === openId ? ' on' : '') + (showing === h.id ? ' shown' : '')}
                  onClick={() => setOpenId(h.id)}>
                  <span className="rt-hos-k">{kindById(h.kind).name}</span>
                  <span>{handoutLabel(h)}</span>
                </button>
              </li>
            ))}
          </ul>

          {cur && (
            <div className="rt-hos-edit">
              <div className="rt-btnrow">
                <select className="rt-sel" value={cur.kind} aria-label="What it is"
                  onChange={(e) => update(cur.id, { kind: e.target.value })}>
                  {HANDOUT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
                <input className="rt-field" value={cur.title} maxLength={MAX_TITLE} placeholder="Its title, if it has one"
                  aria-label="Title" onChange={(e) => update(cur.id, { title: e.target.value })} />
              </div>
              <textarea className="rt-ta" rows={6} value={cur.text} maxLength={MAX_TEXT} aria-label="What it says"
                placeholder="++ Shipment 7-Kappa diverted to the lower hab-stacks on the Arbitrator's seal ++"
                onChange={(e) => update(cur.id, { text: e.target.value })} />
              <div className="rt-btnrow">
                <button type="button" className="rt-btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>
                  {cur.image ? 'Another picture…' : 'Add a picture…'}
                </button>
                {cur.image && (
                  <button type="button" className="rt-btn ghost" onClick={() => update(cur.id, { image: null, imageName: '' })}>
                    No picture
                  </button>
                )}
                <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label="Picture for the handout"
                  onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; choosePicture(f); }} />
                {cur.image && !picture && <span className="rt-vox-hint">The picture is not on this computer.</span>}
                <button type="button" className="rt-btn ghost" onClick={() => remove(cur.id)}>Take it out</button>
              </div>

              <HandoutView handout={cur} image={picture} />

              <div className="rt-btnrow">
                {showing === cur.id
                  ? <button type="button" className="rt-btn" onClick={onHide}>Take it off the table{'’'}s screen</button>
                  : <button type="button" className="rt-btn" onClick={() => onShow(cur)}>Show it on the table{'’'}s screen</button>}
                {cur.kind === 'vox' && cur.text.trim() && (
                  <button type="button" className="rt-btn ghost" onClick={() => speakVox(cur.text)}
                    title="Through this computer's speakers, in a vox voice">Read it out</button>
                )}
              </div>
              {bridgeCode ? (
                <div className="rt-btnrow">
                  <label className="rt-shipsel">
                    <span className="rt-shipsel-k">Hand it to</span>
                    <select className="rt-sel" value={to} aria-label="Hand it to" onChange={(e) => setTo(e.target.value)}>
                      <option value="all">everyone at the table</option>
                      {((table && table.members) || []).map((m) => (
                        <option key={m.charId} value={m.charId}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="rt-btn" disabled={busy || (!cur.title.trim() && !cur.text.trim() && !cur.image)}
                    onClick={send}>{busy ? 'Handing it over…' : 'Hand it over'}</button>
                </div>
              ) : (
                <p className="rt-vox-hint">Open a bridge to hand handouts to the players; the table{'’'}s screen works without one.</p>
              )}
            </div>
          )}
        </div>
      )}

      {table && table.handouts.length > 0 && (<>
        <div className="rt-conds-h">In the players{'’'} hands</div>
        <ul className="rt-list">
          {table.handouts.map((h) => (
            <li key={h.id} className="rt-entry">
              <span className="rt-entry-t">
                {kindById(h.kind).name}: {handoutLabel(h)}
                {' · '}{h.to === 'all' ? 'everyone' : h.to.map(nameOf).join(', ')}
              </span>
              <button type="button" className="rt-btn ghost" onClick={() => withdraw(h.id)}
                title="Gone from their hands, and its picture with it">Take it back</button>
            </li>
          ))}
        </ul>
      </>)}
      {note ? <p className="rt-vox-hint" role="status">{note}</p> : null}
    </div>
  );
}

/* ON THE TABLE'S SCREEN: the handout over whatever the projector is showing,
   until the GM takes it off. Its picture is read from this browser here,
   not handed in, so it outlasts the panel it was shown from. */
export function TableHandout({ handout, onClose }) {
  const picture = useLocalPicture(handout && handout.image);
  if (!handout) return null;
  return (
    <div className="rt-ho-stage" role="dialog" aria-label="Handout on the table's screen">
      <HandoutView handout={handout} image={picture} big animate />
      <button type="button" className="rt-ho-close" onClick={onClose} aria-label="Take it off the screen">{'\u00d7'}</button>
    </div>
  );
}

const SEEN_KEY = 'rt:handouts:seen';
const readSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
};

/* IN A PLAYER'S HANDS: what the GM has handed this character or the whole
   table, newest first. The server sends only those; a picture is fetched when
   the handout is opened, and only those it is for may fetch it. */
export function PlayerHandouts({ handouts = [], code }) {
  const [open, setOpen] = useState(null);
  const [pics, setPics] = useState({});
  const [seen, setSeen] = useState(readSeen);
  const [err, setErr] = useState('');
  useEffect(() => {
    const h = handouts.find((x) => x.id === open);
    if (!h || !h.hasImage || pics[h.id] !== undefined) return;
    setPics((p) => ({ ...p, [h.id]: null }));
    readHandoutImage({ code, id: h.id })
      .then((r) => setPics((p) => ({ ...p, [h.id]: (r && r.image) || '' })))
      .catch(() => { setPics((p) => ({ ...p, [h.id]: '' })); setErr('The picture could not be fetched.'); });
  }, [open, handouts, code]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!handouts.length) return null;
  const toggle = (id) => {
    setOpen((o) => (o === id ? null : id));
    if (!seen.has(id)) {
      const next = new Set(seen); next.add(id);
      setSeen(next);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-200))); } catch { /* full */ }
    }
  };
  return (
    <div className="rt-hos-player">
      <div className="rt-conds-h">Handed to you</div>
      <ul className="rt-list">
        {handouts.map((h) => (
          <li key={h.id} className="rt-entry rt-hos-got">
            <button type="button" className="rt-hos-item" aria-expanded={open === h.id} onClick={() => toggle(h.id)}>
              <span className="rt-hos-k">{kindById(h.kind).name}{seen.has(h.id) ? '' : ' \u00b7 new'}</span>
              <span>{handoutLabel(h)}</span>
            </button>
            {open === h.id && (
              <HandoutView handout={h} image={pics[h.id] || null}>
                {h.kind === 'vox' && h.text && (
                  <button type="button" className="rt-btn ghost" onClick={() => speakVox(h.text)}>Hear it</button>
                )}
              </HandoutView>
            )}
          </li>
        ))}
      </ul>
      {err ? <p className="rt-vox-hint" role="status">{err}</p> : null}
    </div>
  );
}
