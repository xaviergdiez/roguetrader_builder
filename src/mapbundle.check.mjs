// Self-check for sharing the map library. Run: node src/mapbundle.check.mjs
import assert from 'node:assert/strict';
import { readMap, readCustomTheme, packMap } from './battlemap.js';
import {
  BUNDLE_KIND, MAX_IMPORT_DECKS, MAX_IMPORT_GROUNDS,
  uniqueName, bundleFileName, customGroundIds, groundsForDecks,
  makeBundle, bundleText, readBundle, planImport, describePlan
} from './mapbundle.js';

const IMG = 'data:image/png;base64,' + 'A'.repeat(64);
const ground = (id, name = id) => ({ id, name, texture: IMG, prompt: 'cold iron', subtitle: 'ice', custom: true });
const deckOn = (name, themeId, extra = {}) => {
  const floor = {};
  for (let x = 0; x < 12; x++) for (let y = 0; y < 6; y++) floor[`${x},${y}`] = true;
  return { id: 'd-' + name, name, map: readMap({ cols: 20, rows: 12, floor, theme: themeId || 'space_hulk', ...extra }) };
};

/* ---- names ---- */
assert.equal(uniqueName('Hulk', []), 'Hulk');
assert.equal(uniqueName('Hulk', ['Hulk']), 'Hulk (2)');
assert.equal(uniqueName('Hulk', ['Hulk', 'Hulk (2)']), 'Hulk (3)');
assert.equal(uniqueName('  hulk ', ['Hulk']), 'hulk (2)', 'a capital does not make a different deck');
assert.equal(uniqueName('', []), 'Imported deck', 'a nameless deck still has one');
assert.equal(uniqueName('x'.repeat(200), []).length, 70);
assert.match(bundleFileName('Cold derelict!', Date.UTC(2026, 10, 3)), /^rt-maps-cold-derelict-20261103\.json$/);
assert.match(bundleFileName('', Date.UTC(2026, 0, 9)), /^rt-maps-library-20260109\.json$/);

/* ---- what a deck uses ---- */
{
  const d = deckOn('A', 'env-ice', { ground: { '1,1': 'env-fen', '2,2': 'jungle', '3,3': 'env-ice' } });
  assert.deepEqual(customGroundIds(d.map).sort(), ['env-fen', 'env-ice'], 'its own theme and the ones it paints with, not the built-in ones');
  assert.deepEqual(customGroundIds(deckOn('B', 'desert').map), [], 'a built-in floor needs nothing handed over');
  const lib = [ground('env-ice'), ground('env-fen'), ground('env-unused')];
  assert.deepEqual(groundsForDecks([d], lib).map((g) => g.id).sort(), ['env-fen', 'env-ice'], 'only the grounds the deck uses travel with it');
  assert.deepEqual(groundsForDecks([d], [ground('env-ice')]).map((g) => g.id), ['env-ice'], 'a ground that has been deleted is simply not there');
  assert.deepEqual(groundsForDecks([], lib), []);
}

/* ---- a file, and back ---- */
{
  const a = deckOn('Hulk', 'env-ice', { start: { x: 2, y: 2 }, doors: { '5,3': { kind: 'hatch', state: 'jammed' } } });
  const b = deckOn('Station', 'tau_station');
  const bundle = makeBundle({ decks: [a, b], grounds: [ground('env-ice', 'Ice')], name: 'Session 4', now: Date.UTC(2026, 10, 3) });
  assert.equal(bundle.kind, BUNDLE_KIND);
  assert.equal(bundle.v, 1);
  assert.equal(bundle.exportedAt, '2026-11-03T00:00:00.000Z');
  assert.equal(bundle.decks.length, 2);
  assert.ok(bundle.decks[0].map.floor.rle, 'maps are packed in the file');

  const text = bundleText(bundle);
  const back = readBundle(text);
  assert.equal(back.ok, true);
  assert.equal(back.decks.length, 2);
  assert.deepEqual(back.decks[0].map, readMap(a.map), 'the deck comes back exactly as it was, start and doors and all');
  assert.equal(back.decks[0].map.start.x, 2);
  assert.equal(back.decks[0].map.doors['5,3'].state, 'jammed');
  assert.equal(back.grounds.length, 1);
  assert.equal(back.grounds[0].id, 'env-ice');
  assert.equal(back.grounds[0].prompt, 'cold iron', 'and the ground keeps what it was asked for');
  assert.equal(back.dropped, 0);

  // the file is smaller than the maps' own JSON
  const loose = JSON.stringify({ decks: [a, b].map((d) => ({ id: d.id, name: d.name, map: d.map })) }).length;
  assert.ok(text.length - JSON.stringify(bundle.grounds).length < loose, 'packing keeps a deck file smaller than the raw map');
  // nothing transient leaks into the file
  const withFlags = makeBundle({ decks: [{ ...a, dirty: true, renamed: true, bytes: 99 }] });
  assert.deepEqual(Object.keys(withFlags.decks[0]).sort(), ['id', 'map', 'name']);
  // a deck with no map in hand is not exported (the host fetches it first)
  assert.equal(makeBundle({ decks: [{ id: 'x', name: 'unloaded' }] }).decks.length, 0);
}

/* ---- reading any shape ---- */
{
  const a = deckOn('A');
  const packed = makeBundle({ decks: [a] }).decks[0];
  // one saved deck
  let r = readBundle({ id: 'z', name: 'Single', map: packed.map });
  assert.equal(r.ok, true);
  assert.deepEqual(r.decks.map((d) => d.name), ['Single']);
  // a bare map
  r = readBundle(readMap(a.map));
  assert.equal(r.ok, true);
  assert.equal(r.decks.length, 1);
  // a list of decks
  r = readBundle([{ name: 'One', map: packed.map }, { name: 'Two', map: packed.map }]);
  assert.deepEqual(r.decks.map((d) => d.name), ['One', 'Two']);
  // a ground on its own
  r = readBundle(ground('env-x', 'Fen'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.grounds.map((g) => g.name), ['Fen']);
  assert.equal(r.decks.length, 0);
  // a mixed list
  r = readBundle([{ name: 'D', map: packed.map }, ground('env-y')]);
  assert.equal(r.decks.length, 1);
  assert.equal(r.grounds.length, 1);
  // JSON as text
  assert.equal(readBundle(JSON.stringify([{ name: 'T', map: packed.map }])).decks[0].name, 'T');
}

/* ---- forgiving about shape, strict about content ---- */
{
  assert.equal(readBundle('not json at all').ok, false);
  assert.match(readBundle('not json at all').error, /not JSON/);
  assert.equal(readBundle(null).ok, false);
  assert.equal(readBundle(42).ok, false);
  assert.equal(readBundle({}).ok, false);
  assert.match(readBundle({ hello: 'world' }).error, /no decks or environments/);
  assert.equal(readBundle([]).ok, false);
  assert.equal(readBundle('x'.repeat(40_000_001)).ok, false, 'a file past the ceiling is refused before it is parsed');

  const a = deckOn('A');
  const packed = makeBundle({ decks: [a] }).decks[0];
  const r = readBundle({
    kind: BUNDLE_KIND,
    decks: [{ name: 'Fine', map: packed.map }, { name: 'No map' }, 'junk', { name: 'Not a map', map: { hello: 1 } }],
    grounds: [ground('env-ok'), { id: 'env-bad', name: 'No floor' }, { id: 'env-bad2', texture: 'javascript:alert(1)' }]
  });
  assert.equal(r.ok, true);
  assert.equal(r.decks.length, 1);
  assert.equal(r.grounds.length, 1);
  assert.equal(r.dropped, 5, 'what was there and could not be used is counted');
  // hostile content is normalised, not trusted
  const evil = readBundle({ decks: [{ name: '<img src=x onerror=1>'.repeat(20), map: { cols: 99999, rows: -4, floor: { '1,1': true, 'x,y': true }, theme: '"><script>' } }] });
  assert.equal(evil.ok, true);
  assert.ok(evil.decks[0].map.cols <= 500 && evil.decks[0].map.rows >= 5, 'a map is clamped to the sizes the app allows');
  assert.ok(!('x,y' in evil.decks[0].map.floor), 'a square that is not a square is dropped');
  assert.ok(evil.decks[0].name.length <= 80);
  assert.equal(readCustomTheme({ id: 'g', name: 'g', texture: 'https://evil.example/x.png' }), null, 'a ground may only carry an embedded image');

  // counts are capped
  const many = Array.from({ length: MAX_IMPORT_DECKS + 5 }, (_, i) => ({ name: `d${i}`, map: packed.map }));
  const capped = readBundle({ decks: many });
  assert.equal(capped.decks.length, MAX_IMPORT_DECKS);
  assert.equal(capped.dropped, 5);
  const manyG = Array.from({ length: MAX_IMPORT_GROUNDS + 3 }, (_, i) => ground(`env-${i}`));
  assert.equal(readBundle({ grounds: manyG }).grounds.length, MAX_IMPORT_GROUNDS);
}

/* ---- planning an import ---- */
{
  const a = deckOn('Hulk', 'env-ice');
  const b = deckOn('Station');
  const file = readBundle(makeBundle({ decks: [a, b], grounds: [ground('env-ice'), ground('env-fen')] }));

  // into an empty library: everything is new
  let plan = planImport(file, { decks: [], grounds: [] });
  assert.deepEqual(plan.decks.map((d) => d.name), ['Hulk', 'Station']);
  assert.equal(plan.grounds.length, 2);
  assert.equal(plan.alreadyHad, 0);
  assert.deepEqual(plan.missing, []);
  assert.ok(plan.decks.every((d) => d.id && d.id !== 'd-Hulk'), 'an imported deck gets a new id, never the old one');
  assert.notEqual(plan.decks[0].id, plan.decks[1].id);
  assert.equal(describePlan(plan), '2 decks and 2 environments');

  // into one that has them: names are made distinct, grounds are not doubled
  plan = planImport(file, { decks: [{ name: 'Hulk' }, { name: 'Station (2)' }], grounds: [{ id: 'env-ice' }] });
  assert.deepEqual(plan.decks.map((d) => d.name), ['Hulk (2)', 'Station'], 'a clash is renamed, not overwritten');
  assert.deepEqual(plan.grounds.map((g) => g.id), ['env-fen'], 'a ground you already hold is not imported again');
  assert.equal(plan.alreadyHad, 1);
  // two imported decks with the same name are told apart from each other too
  const twins = readBundle({ decks: [{ name: 'Twin', map: makeBundle({ decks: [a] }).decks[0].map }, { name: 'Twin', map: makeBundle({ decks: [a] }).decks[0].map }] });
  assert.deepEqual(planImport(twins, {}).decks.map((d) => d.name), ['Twin', 'Twin (2)']);
  // a ground twice in one file is imported once
  const dup = readBundle({ grounds: [ground('env-q'), ground('env-q')] });
  assert.equal(planImport(dup, {}).grounds.length, 1);

  // a deck drawn on a ground that is in neither place
  const lone = readBundle(makeBundle({ decks: [a] }));
  plan = planImport(lone, { decks: [], grounds: [] });
  assert.deepEqual(plan.missing, ['env-ice'], 'the deck will use a built-in floor, and the plan says so');
  plan = planImport(lone, { decks: [], grounds: [{ id: 'env-ice' }] });
  assert.deepEqual(plan.missing, [], 'unless you have it');

  assert.equal(describePlan({ decks: [], grounds: [] }), 'nothing new');
  assert.equal(describePlan({ decks: [1], grounds: [] }), '1 deck');
  assert.equal(describePlan({ decks: [], grounds: [1] }), '1 environment');
  assert.equal(planImport(file).decks.length, 2, 'no existing library at all');
}

console.log('mapbundle checks passed');
