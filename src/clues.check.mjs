// Self-check for the investigation clues. Run: node src/clues.check.mjs
import assert from 'node:assert/strict';
import { GODS, godById, MARKS_OF_CHAOS, markForRoll, MARKS_PAGE, XENOS, xenosById, rollClue, CLUES_BOOK } from './clues.js';

assert.ok(/Inquisition GM/.test(CLUES_BOOK));

/* ---- the gods: the book’s sacred numbers ---- */
{
  assert.deepEqual(GODS.map((g) => g.id), ['khorne', 'nurgle', 'slaanesh', 'tzeentch', 'undivided']);
  const n = Object.fromEntries(GODS.map((g) => [g.id, g.number]));
  assert.equal(n.khorne, 8);
  assert.equal(n.nurgle, 7);
  assert.equal(n.slaanesh, 6);
  assert.equal(n.tzeentch, 9);
  for (const g of GODS) {
    assert.ok(g.motifs.length >= 2, `${g.id}: motifs`);
    for (const t of [g.domain, ...g.motifs]) assert.ok(t.length > 12 && t.length < 200, `${g.id}: a line of ${t.length}`);
    assert.ok(g.page >= 48 && g.page <= 49);
  }
  assert.equal(godById('nurgle').name, 'Nurgle');
  assert.equal(godById('x'), null);
}

/* ---- the Marks of Chaos table: twenty, covering 1-100 once ---- */
{
  assert.equal(MARKS_OF_CHAOS.length, 20);
  assert.equal(MARKS_PAGE, 50);
  let next = 1;
  for (const m of MARKS_OF_CHAOS) {
    assert.equal(m.from, next, `${m.name} starts where the last ended`);
    assert.equal(m.to - m.from, 4, `${m.name}: bands of five`);
    assert.ok(m.sign.length > 15 && m.sign.length < 200, `${m.name}: a line`);
    next = m.to + 1;
  }
  assert.equal(next, 101);
  assert.equal(markForRoll(1).name, 'Beak');
  assert.equal(markForRoll(5).name, 'Beak');
  assert.equal(markForRoll(6).name, 'Bizarre Colouration');
  assert.equal(markForRoll(100).name, 'Weeping Sores');
  assert.equal(markForRoll(0).name, 'Beak', 'clamped');
  for (let r = 1; r <= 100; r++) assert.ok(markForRoll(r), `a mark for ${r}`);
  assert.deepEqual(MARKS_OF_CHAOS.map((m) => m.name).slice(0, 3), ['Beak', 'Bizarre Colouration', 'Bone Spikes'], 'in the book’s alphabetical order');
  const names = MARKS_OF_CHAOS.map((m) => m.name);
  assert.deepEqual([...names].sort((a, b) => a.localeCompare(b)), names, 'the table is alphabetical, as printed');
}

/* ---- xenos ---- */
{
  assert.equal(XENOS.length, 7);
  assert.deepEqual(XENOS.map((x) => x.id), ['aeldari', 'drukhari', 'votann', 'necrons', 'tau', 'orks', 'genestealer']);
  for (const x of XENOS) {
    assert.ok(x.signs.length >= 2, `${x.id}: signs`);
    assert.ok(x.page >= 51 && x.page <= 52);
    for (const s of x.signs) assert.ok(s.length > 20 && s.length < 220, `${x.id}: a sign of ${s.length}`);
  }
  assert.equal(xenosById('tau').name, 'T’au Empire');
  assert.equal(xenosById('x'), null);
}

/* ---- rolling one ---- */
{
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  const c = rollClue({ kind: 'chaos', id: 'khorne', rng: seq(0, 0) });
  assert.equal(c.title, 'Signs of Khorne');
  assert.match(c.lines[0], /Sacred number 8/);
  assert.equal(c.lines.length, 3, 'the number and two motifs');
  assert.equal(new Set(c.lines).size, 3, 'no repeats');
  assert.equal(c.page, 49);
  assert.ok(GODS.find((g) => g.id === 'khorne').motifs.includes(c.lines[1]));

  // Rolled, a god is never the undivided Mark: that is for extraordinary villains.
  for (let i = 0; i < 100; i++) assert.notEqual(rollClue({ kind: 'chaos', rng: Math.random }).id, 'undivided');
  assert.equal(rollClue({ kind: 'chaos', rng: () => 0 }).id, 'khorne');
  assert.equal(rollClue({ kind: 'chaos', rng: () => 0.999 }).id, 'tzeentch');
  assert.equal(rollClue({ kind: 'chaos', id: 'undivided' }).id, 'undivided', 'but it can be asked for');

  const m = rollClue({ kind: 'mark', rng: () => 0 });
  assert.equal(m.title, 'Mark of Chaos: Beak');
  assert.equal(m.page, 50);
  assert.equal(rollClue({ kind: 'mark', rng: () => 0.999 }).title, 'Mark of Chaos: Weeping Sores');

  const x = rollClue({ kind: 'xenos', id: 'genestealer', rng: seq(0, 0) });
  assert.equal(x.title, 'Signs of xenos: Genestealer Cult');
  assert.equal(x.lines.length, 2);
  assert.equal(x.page, 52);
  assert.equal(rollClue({ kind: 'xenos', id: 'orks', rng: () => 0 }).lines.length, 2);
  assert.ok(xenosById(rollClue({ kind: 'xenos', rng: () => 0.5 }).id), 'a species when none is asked for');
  assert.equal(rollClue({}).kind, 'chaos', 'chaos by default');
  for (const k of ['chaos', 'mark', 'xenos']) {
    const r = rollClue({ kind: k });
    assert.ok(r.title && r.lines.length > 0 && r.page >= 48 && r.page <= 52, k);
    assert.ok(!/undefined|NaN|null/.test(JSON.stringify(r)), `${k}: nothing half-built`);
  }
}

console.log('clues.check.mjs: all assertions passed');
