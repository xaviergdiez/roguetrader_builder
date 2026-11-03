import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_THEMES, floorBounds, parseKey } from './battlemap.js';
import { readBundle, planImport, describePlan, MAX_BUNDLE_BYTES } from './mapbundle.js';

/* The map library, in one place.

   Saved decks and saved environments (generated and uploaded grounds) used to
   be reachable only through a pair of dropdowns in two different panels, and
   nothing could be renamed, copied, taken out of the app or brought into it.
   This is the one panel that does all of that, and the same panel is shown
   wherever the map is: the GM dashboard's Battle map tab, the map's own
   window, on the Build tab and the Play tab alike.

   It holds no data of its own. Everything it shows and every change it asks
   for goes through `lib`, built once in the app, so the dashboard and the
   window cannot disagree about what the library holds. */

/* ---- a deck's picture ----
   Not the rendered map (that needs its textures): the shape of it. Floor in the
   deck's own colour, doors in their state's colour, and the starting room. At a
   size a list can hold a few dozen of. A big deck is sampled rather than
   walked square by square. */
const THUMB_W = 104;
const THUMB_H = 64;

function DeckThumb({ map }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    g.fillStyle = '#080c0a';
    g.fillRect(0, 0, THUMB_W, THUMB_H);
    if (!map || !map.floor) return;
    const b = floorBounds(map.floor);
    if (!b) return;
    const w = b.cols;
    const h = b.rows;
    const s = Math.min((THUMB_W - 6) / w, (THUMB_H - 6) / h);
    const ox = (THUMB_W - w * s) / 2;
    const oy = (THUMB_H - h * s) / 2;
    const cell = Math.max(1, s);
    // Every square when there are few; a stride when there are many, so a
    // 500x500 deck costs about what a small one does.
    const keys = Object.keys(map.floor);
    const stride = Math.max(1, Math.floor(keys.length / 6000));
    g.fillStyle = '#6f8f86';
    for (let i = 0; i < keys.length; i += stride) {
      const p = parseKey(keys[i]);
      if (!p) continue;
      g.fillRect(ox + (p.x - b.minX) * s, oy + (p.y - b.minY) * s, cell * (stride > 1 ? 1.6 : 1), cell * (stride > 1 ? 1.6 : 1));
    }
    const col = { open: '#2ecc71', jammed: '#f39c12', closed: '#e74c3c' };
    for (const [k, d] of Object.entries(map.doors || {})) {
      const p = parseKey(k);
      if (!p) continue;
      g.fillStyle = col[d.state] || '#e74c3c';
      g.fillRect(ox + (p.x - b.minX) * s - 0.5, oy + (p.y - b.minY) * s - 0.5, Math.max(2, cell) + 1, Math.max(2, cell) + 1);
    }
    if (map.start) {
      g.fillStyle = '#f3c96e';
      g.beginPath();
      g.arc(ox + (map.start.x - b.minX + 0.5) * s, oy + (map.start.y - b.minY + 0.5) * s, Math.max(2, s * 0.8), 0, Math.PI * 2);
      g.fill();
    }
  }, [map]);
  return <canvas ref={ref} className="rt-ml-thumb" width={THUMB_W} height={THUMB_H} aria-hidden="true" />;
}

const sizeOf = (d) => (d.map ? `${d.map.cols}×${d.map.rows}` : d.cols && d.rows ? `${d.cols}×${d.rows}` : '');

// How many decks (and grounds) are fetched for their pictures when the panel
// opens. Signed in, a deck is a round trip; a long library is not worth a
// hundred of them for thumbnails.
const PREFETCH = 12;

export default function MapLibrary({
  lib, win = null, liveMap = null, onOpen = null, onPlay = null, onUseGround = null, onClose = null
}) {
  const [section, setSection] = useState('decks');
  const [filter, setFilter] = useState('');
  const [ask, setAsk] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [saveName, setSaveName] = useState('');
  const [plan, setPlan] = useState(null);
  const [builtIn, setBuiltIn] = useState(false);
  const fileRef = useRef(null);
  const tried = useRef(new Set());

  const decks = lib.decks || [];
  const grounds = (lib.grounds || []).filter((g) => g.custom !== false);
  const q = filter.trim().toLowerCase();
  const shownDecks = useMemo(
    () => decks.filter((d) => !q || String(d.name || '').toLowerCase().includes(q)),
    [decks, q]
  );
  const shownGrounds = useMemo(
    () => grounds.filter((g) => !q || String(g.name || '').toLowerCase().includes(q) || String(g.prompt || '').toLowerCase().includes(q)),
    [grounds, q]
  );

  // Pictures: the first few decks and grounds that have not come in yet.
  useEffect(() => {
    let live = true;
    (async () => {
      let n = 0;
      for (const d of shownDecks) {
        if (!live || n >= PREFETCH) break;
        if (d.map || tried.current.has('d' + d.id)) continue;
        tried.current.add('d' + d.id);
        n++;
        // eslint-disable-next-line no-await-in-loop
        if (lib.needDeck) await lib.needDeck(d.id);
      }
      for (const g of shownGrounds) {
        if (!live || n >= PREFETCH * 2) break;
        if (g.texture || tried.current.has('g' + g.id)) continue;
        tried.current.add('g' + g.id);
        n++;
        // eslint-disable-next-line no-await-in-loop
        if (lib.needTexture) await lib.needTexture(g.id);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownDecks, shownGrounds, section]);

  const download = (filename, text) => {
    const doc = (win || window).document;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // One thing at a time, and a line saying what happened.
  const run = async (label, fn) => {
    if (busy) return null;
    setBusy(label); setNote('');
    try { return await fn(); } finally { setBusy(''); }
  };
  const confirmThen = (title, body, yes, fn) => setAsk({ title, body, yes, fn });

  const saveFile = (ids, what) => run(`Preparing ${what}…`, async () => {
    const out = await lib.exportDecks(ids);
    if (!out || !out.decks) { setNote('Nothing could be prepared.'); return; }
    download(out.filename, out.text);
    setNote(`Saved ${out.filename}: ${describePlan({ decks: Array(out.decks), grounds: Array(out.grounds) })}.`);
  });

  const saveGroundFile = (g) => run('Preparing the environment…', async () => {
    const out = await lib.exportGrounds([g.id]);
    if (!out || !out.grounds) { setNote('Nothing could be prepared.'); return; }
    download(out.filename, out.text);
    setNote(`Saved ${out.filename}.`);
  });

  /* ---- importing ---- */
  const pick = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const merged = { decks: [], grounds: [], dropped: 0 };
    const problems = [];
    for (const f of list) {
      if (f.size > MAX_BUNDLE_BYTES) { problems.push(`${f.name} is too large`); continue; }
      let text;
      try { text = await f.text(); } catch { problems.push(`${f.name} could not be read`); continue; }
      const r = readBundle(text);
      if (!r.ok) { problems.push(`${f.name}: ${r.error}`); continue; }
      merged.decks.push(...r.decks);
      merged.grounds.push(...r.grounds);
      merged.dropped += r.dropped;
    }
    if (fileRef.current) fileRef.current.value = '';
    if (!merged.decks.length && !merged.grounds.length) {
      setPlan(null);
      setNote(problems.length ? problems.join(' · ') : 'There was nothing in that to import.');
      return;
    }
    const p = planImport(merged, { decks, grounds });
    setPlan({ ...p, problems });
    setNote('');
  };
  const doImport = () => run('Importing…', async () => {
    const out = await lib.importPlan(plan);
    const bits = [];
    if (out.decks) bits.push(`${out.decks} deck${out.decks === 1 ? '' : 's'}`);
    if (out.grounds) bits.push(`${out.grounds} environment${out.grounds === 1 ? '' : 's'}`);
    setNote(`Imported ${bits.join(' and ') || 'nothing'}.${out.failed && out.failed.length ? ` Could not store: ${out.failed.join(', ')}.` : ''}`);
    setPlan(null);
    setSection('decks');
  });

  const saveCurrent = () => {
    if (!liveMap || !lib.saveHere) return;
    const saved = lib.saveHere({ id: null, name: saveName, map: liveMap });
    if (saved) { setNote(`Saved the map on screen as “${saved.name}”.`); setSaveName(''); }
  };

  const dirtyNote = (d) => (d.dirty || d.renamed ? 'saving…' : '');

  const counts = { decks: decks.length, envs: grounds.length };

  return (
    <div className="rt-ml">
      <div className="rt-ml-head">
        <div className="rt-ml-tabs" role="tablist" aria-label="Library sections">
          {[['decks', `Decks (${counts.decks})`], ['envs', `Environments (${counts.envs})`], ['share', 'Share and import']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={section === id}
              className={'rt-btn rt-bm-mode' + (section === id ? ' on' : '')} onClick={() => setSection(id)}>{label}</button>
          ))}
        </div>
        {section !== 'share' && (
          <input className="rt-field rt-ml-filter" value={filter} placeholder="Find by name"
            onChange={(e) => setFilter(e.target.value)} aria-label="Find by name" />
        )}
        {onClose && <button type="button" className="rt-btn ghost" onClick={onClose}>Close</button>}
      </div>

      {(lib.error || note || busy) && (
        <p className={lib.error && !note && !busy ? 'rt-warn' : 'rt-bm-hint'} role="status">
          {busy || note || lib.error}
        </p>
      )}

      {ask && (
        <div className="rt-ml-ask" role="alertdialog" aria-label={ask.title}>
          <div><b>{ask.title}</b> {ask.body}</div>
          <div className="rt-ml-askrow">
            <button type="button" className="rt-btn" autoFocus
              onClick={() => { const f = ask.fn; setAsk(null); f(); }}>{ask.yes}</button>
            <button type="button" className="rt-btn ghost" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}

      {section === 'decks' && (<>
        <div className="rt-ml-bar">
          {lib.create && <button type="button" className="rt-btn" onClick={() => { lib.create(); setNote('Started a new deck.'); }}>New deck</button>}
          {liveMap && lib.saveHere && (<>
            <input className="rt-field" value={saveName} maxLength={80} placeholder="Name the map on screen"
              onChange={(e) => setSaveName(e.target.value)} aria-label="Name for the map on screen" />
            <button type="button" className="rt-btn" onClick={saveCurrent}
              title="Keep the map on screen as a new deck in the library">Save the map on screen</button>
          </>)}
          {lib.findLost && (
            <button type="button" className="rt-btn ghost"
              title="Look for decks stored in your account that have dropped out of this list"
              onClick={() => run('Looking…', async () => {
                const n = await lib.findLost();
                setNote(n ? `Found ${n} ${n === 1 ? 'deck' : 'decks'} that had dropped out of the list, now listed as \u201cRecovered deck\u201d. Rename ${n === 1 ? 'it' : 'them'} here.`
                  : 'Nothing lost: every deck stored in your account is already in this list.');
              })}>Find lost decks</button>
          )}
          <span className="rt-bm-hint">
            {decks.length === 0 ? 'No saved decks yet.' : `${shownDecks.length} of ${decks.length}`}
          </span>
        </div>
        <ul className="rt-ml-list">
          {shownDecks.map((d) => {
            const current = d.id === lib.currentDeckId;
            return (
              <li key={d.id} className={'rt-ml-row' + (current ? ' on' : '')}>
                {d.map ? <DeckThumb map={d.map} /> : <div className="rt-ml-thumb empty" aria-hidden="true">{sizeOf(d) || '…'}</div>}
                <div className="rt-ml-main">
                  <input key={`${d.id}:${d.name}`} className="rt-ml-name" defaultValue={d.name || ''}
                    placeholder="Untitled deck" maxLength={80} aria-label={`Name of ${d.name || 'untitled deck'}`}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) lib.rename(d.id, v); else e.target.value = d.name || ''; }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = d.name || ''; e.target.blur(); } }} />
                  <div className="rt-ml-meta">
                    {sizeOf(d)}{d.map && d.map.start ? ' · start chosen' : d.map ? ' · no start' : ''}
                    {current ? ' · open in Build' : ''}
                    {dirtyNote(d) ? ` · ${dirtyNote(d)}` : ''}
                  </div>
                  <div className="rt-ml-acts">
                    <button type="button" className="rt-btn" disabled={Boolean(busy)}
                      title="Open it to draw on, on the Build tab"
                      onClick={() => run('Opening…', async () => { const ok = await (onOpen || lib.open)(d.id); setNote(ok === false ? 'Could not open it.' : `Opened “${d.name || 'Untitled deck'}” to build.`); })}>Open</button>
                    <button type="button" className="rt-btn" disabled={Boolean(busy)}
                      title="Put it on the table: fog on, the starting room lit, ready to play"
                      onClick={() => {
                        const go = () => run('Opening…', async () => { const ok = await (onPlay || lib.play)(d.id); setNote(ok === false ? 'Could not open it.' : `“${d.name || 'Untitled deck'}” is on the table.`); });
                        if (lib.liveOccupied) confirmThen('Replace the map on the table?', `“${d.name || 'Untitled deck'}” takes its place.`, 'Play it', go);
                        else go();
                      }}>Play</button>
                    <button type="button" className="rt-btn ghost" disabled={Boolean(busy)} title="Make a copy to change without touching this one"
                      onClick={() => run('Copying…', async () => { const made = await lib.duplicate(d.id); setNote(made ? `Copied as “${made.name}”.` : 'Could not copy it.'); })}>Copy</button>
                    <button type="button" className="rt-btn ghost" disabled={Boolean(busy)}
                      title="Save it as a file, with the environments it uses, to keep or hand to someone"
                      onClick={() => saveFile([d.id], `“${d.name || 'deck'}”`)}>File</button>
                    {liveMap && lib.saveHere && (
                      <button type="button" className="rt-btn ghost" disabled={Boolean(busy)} title="Replace this deck with the map on screen"
                        onClick={() => confirmThen(`Replace “${d.name || 'Untitled deck'}”?`, 'It becomes the map on screen. The old drawing is gone.', 'Replace it',
                          () => { const s = lib.saveHere({ id: d.id, name: d.name, map: liveMap }); setNote(s ? `Saved over “${d.name}”.` : 'Could not save.'); })}>Save here</button>
                    )}
                    <button type="button" className="rt-btn ghost" disabled={Boolean(busy)} title="Delete it from the library for good"
                      onClick={() => confirmThen(`Delete “${d.name || 'Untitled deck'}”?`, 'It goes out of the library for good.', 'Delete it',
                        () => run('Deleting…', async () => { const ok = await lib.remove(d.id); setNote(ok === false ? 'Could not delete it.' : `Deleted “${d.name || 'Untitled deck'}”.`); }))}>Delete</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {decks.length > 0 && shownDecks.length === 0 && <p className="rt-bm-hint">No deck has that in its name.</p>}
      </>)}

      {section === 'envs' && (<>
        {lib.findLostGrounds && (
          <div className="rt-ml-bar">
            <button type="button" className="rt-btn ghost"
              title="Look for environments stored in your account that have dropped out of this list"
              onClick={() => run('Looking…', async () => {
                const n = await lib.findLostGrounds();
                setNote(n ? `Found ${n} ${n === 1 ? 'environment' : 'environments'} that had dropped out of the list, now listed as \u201cRecovered environment\u201d. Rename ${n === 1 ? 'it' : 'them'} here.`
                  : 'Nothing lost: every environment stored in your account is already in this list.');
              })}>Find lost environments</button>
          </div>
        )}
        <p className="rt-bm-hint">
          Environments are the floors a deck is drawn on: the ones you generated or uploaded. Use puts one under the deck
          that is open. Deleting one does not touch the decks drawn on it; they fall back to a built-in floor.
        </p>
        <ul className="rt-ml-list">
          {shownGrounds.map((g) => (
            <li key={g.id} className="rt-ml-row">
              <div className="rt-ml-swatch" aria-hidden="true"
                style={{ backgroundColor: g.fallback || '#222', backgroundImage: g.texture ? `url(${g.texture})` : undefined }} />
              <div className="rt-ml-main">
                <input key={`${g.id}:${g.name}`} className="rt-ml-name" defaultValue={g.name || ''} maxLength={60}
                  aria-label={`Name of ${g.name}`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) run('Renaming…', async () => { const ok = await lib.renameGround(g.id, v); if (ok === false) setNote('Could not rename it.'); }); else e.target.value = g.name || ''; }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = g.name || ''; e.target.blur(); } }} />
                <div className="rt-ml-meta" title={g.prompt || ''}>
                  {g.prompt ? g.prompt.slice(0, 90) : (g.subtitle || 'Uploaded floor')}
                  {g.hasSprites || g.sprites ? ' · with props' : ''}
                </div>
                <div className="rt-ml-acts">
                  {onUseGround && (
                    <button type="button" className="rt-btn" onClick={() => { onUseGround(g.id); setNote(`“${g.name}” is under the deck on screen.`); }}
                      title="Draw the deck that is open on this environment">Use</button>
                  )}
                  <button type="button" className="rt-btn ghost" disabled={Boolean(busy)} onClick={() => saveGroundFile(g)}
                    title="Save it as a file to keep or hand to someone">File</button>
                  <button type="button" className="rt-btn ghost" disabled={Boolean(busy)} title="Delete it from the library for good"
                    onClick={() => confirmThen(`Delete “${g.name}”?`, 'Decks drawn on it fall back to a built-in floor.', 'Delete it',
                      () => run('Deleting…', async () => { const ok = await lib.removeGround(g.id); setNote(ok === false ? 'Could not delete it.' : `Deleted “${g.name}”.`); }))}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {grounds.length === 0 && <p className="rt-bm-hint">No saved environments yet. Generate or upload one under Ground on the Build tab and keep it.</p>}
        <button type="button" className="rt-btn ghost" onClick={() => setBuiltIn((v) => !v)} aria-expanded={builtIn}>
          {builtIn ? 'Hide' : 'Show'} the {MAP_THEMES.length} built-in environments
        </button>
        {builtIn && (
          <ul className="rt-ml-list">
            {MAP_THEMES.map((t) => (
              <li key={t.id} className="rt-ml-row">
                <div className="rt-ml-swatch" aria-hidden="true" style={{ backgroundColor: t.fallback, backgroundImage: `url(${t.texture})` }} />
                <div className="rt-ml-main">
                  <div className="rt-ml-name static">{t.name}</div>
                  <div className="rt-ml-meta">{t.subtitle}</div>
                  <div className="rt-ml-acts">
                    {onUseGround && <button type="button" className="rt-btn" onClick={() => { onUseGround(t.id); setNote(`“${t.name}” is under the deck on screen.`); }}>Use</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </>)}

      {section === 'share' && (<>
        <p className="rt-bm-hint">
          A file carries decks and the environments they are drawn on, so what is handed over looks the same where it lands.
          It is ordinary JSON: keep it, email it, put it in a shared folder. Importing never overwrites anything you have.
        </p>
        <div className="rt-ml-bar">
          <button type="button" className="rt-btn" disabled={Boolean(busy) || (!decks.length && !grounds.length)}
            onClick={() => saveFile('all', 'the whole library')}
            title="Every deck and every environment, in one file">Save the whole library</button>
          <button type="button" className="rt-btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={Boolean(busy)}>Import files…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden
            onChange={(e) => pick(e.target.files)} />
          <span className="rt-bm-hint">{counts.decks} deck{counts.decks === 1 ? '' : 's'} and {counts.envs} environment{counts.envs === 1 ? '' : 's'} in your library.</span>
        </div>
        {plan && (
          <div className="rt-ml-plan">
            <div><b>Ready to import {describePlan(plan)}.</b></div>
            {plan.decks.length > 0 && (
              <ul className="rt-ml-plist">
                {plan.decks.slice(0, 12).map((d) => <li key={d.id}>Deck: {d.name} ({d.map.cols}{'×'}{d.map.rows})</li>)}
                {plan.decks.length > 12 && <li>and {plan.decks.length - 12} more decks</li>}
              </ul>
            )}
            {plan.grounds.length > 0 && (
              <ul className="rt-ml-plist">
                {plan.grounds.slice(0, 12).map((g) => <li key={g.id}>Environment: {g.name}</li>)}
              </ul>
            )}
            {plan.alreadyHad > 0 && <p className="rt-bm-hint">{plan.alreadyHad} environment{plan.alreadyHad === 1 ? ' is' : 's are'} already in your library and will not be added again.</p>}
            {plan.missing.length > 0 && <p className="rt-warn">{plan.missing.length} environment{plan.missing.length === 1 ? '' : 's'} these decks were drawn on {plan.missing.length === 1 ? 'is' : 'are'} not in the file or your library, so those decks will use a built-in floor.</p>}
            {plan.dropped > 0 && <p className="rt-bm-hint">{plan.dropped} thing{plan.dropped === 1 ? '' : 's'} in the file could not be read and will be left out.</p>}
            {plan.problems && plan.problems.length > 0 && <p className="rt-warn">{plan.problems.join(' · ')}</p>}
            <div className="rt-ml-askrow">
              <button type="button" className="rt-btn" onClick={doImport} disabled={Boolean(busy) || (!plan.decks.length && !plan.grounds.length)}>Import</button>
              <button type="button" className="rt-btn ghost" onClick={() => setPlan(null)}>Cancel</button>
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}
