import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildCodex, searchCodex, sectionCounts, SECTIONS, CODEX_NOTE } from './codex.js';

/* The Lore tab: the rules the app plays by, readable by everyone at the table.

   A modal like the roster, not a page, so it opens over whatever is on screen
   (the sheet, the bridge, the GM dashboard) and closes back onto it. Nothing
   in it needs a sign-in or a network: the catalogue is built from the same
   tables the dice roller uses (see codex.js), so it is as true as the rolls.

   With nothing typed it is a contents page: the sections, each with a line on
   what is in it. Typing searches every section at once; a section chip narrows
   to one. */

export default function CodexDialog({ onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const all = useMemo(() => buildCodex(), []);
  const counts = useMemo(() => sectionCounts(all), [all]);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('');
  const hits = useMemo(() => searchCodex(all, query, section), [all, query, section]);
  const searching = query.trim().length > 0;
  const home = !searching && !section;
  const titleOf = useMemo(() => Object.fromEntries(SECTIONS.map((s) => [s.id, s.title])), []);

  // A table is worth opening on sight when there are few of them; a section of
  // forty is a list to scan, closed, and opened where it matters.
  const tables = hits.filter((e) => e.rows.length > 0).length;
  const openTables = tables <= 6;

  return (
    <dialog ref={dialogRef} className="rt-framer rt-cx" onClose={onClose} aria-label="Lore and rules">
      <div className="rt-framer-h">
        <span className="rt-framer-t">Lore and rules</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      <input className="rt-field rt-cx-search" type="search" value={query} placeholder="Search the rules… (pinned, charge, fear, hit location)"
        aria-label="Search the rules" onChange={(e) => setQuery(e.target.value)} />

      <div className="rt-cx-chips" role="tablist" aria-label="Sections">
        <button type="button" role="tab" aria-selected={!section} className={'rt-cx-chip' + (!section ? ' on' : '')}
          onClick={() => setSection('')}>All<i>{all.length}</i></button>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id}
            className={'rt-cx-chip' + (section === s.id ? ' on' : '')}
            onClick={() => setSection(section === s.id ? '' : s.id)}>{s.title}<i>{counts[s.id] || 0}</i></button>
        ))}
      </div>

      {home ? (
        <div className="rt-cx-home">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="rt-cx-card" onClick={() => setSection(s.id)}>
              <b>{s.title}</b>
              <span>{s.blurb}</span>
              <em>{counts[s.id] || 0} entries</em>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="rt-cx-count" role="status">
            {searching
              ? `${hits.length} ${hits.length === 1 ? 'entry matches' : 'entries match'} “${query.trim()}”${section ? ` in ${titleOf[section]}` : ''}`
              : titleOf[section]}
          </p>
          {hits.length === 0 ? (
            <p className="rt-vox-hint">
              Nothing in the rules matches that. Try one word, or clear the section to search all of them.
            </p>
          ) : (
            <div className="rt-cx-list">
              {hits.map((e) => {
                const head = (
                  <>
                    <span className="rt-cx-t">{e.title}</span>
                    <span className="rt-cx-tag">{!section ? `${titleOf[e.section]} · ` : ''}{e.tag}</span>
                  </>
                );
                const rows = e.rows.length > 0 && (
                  <dl className="rt-cx-rows">
                    {e.rows.map(([k, v], i) => (
                      <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
                    ))}
                  </dl>
                );
                // A one-line entry is shown whole; a table folds under its name.
                return e.rows.length === 0 ? (
                  <div key={e.id} className="rt-cx-e">
                    <div className="rt-cx-sum">{head}</div>
                    {e.body ? <p className="rt-cx-b">{e.body}</p> : null}
                  </div>
                ) : (
                  <details key={e.id + '|' + query + '|' + section} className="rt-cx-e" open={openTables}>
                    <summary>{head}</summary>
                    {e.body ? <p className="rt-cx-b">{e.body}</p> : null}
                    {rows}
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}

      <p className="rt-vox-hint rt-cx-note">{CODEX_NOTE}</p>
    </dialog>
  );
}
