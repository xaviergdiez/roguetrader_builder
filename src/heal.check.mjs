// Self-checks for putting a browser's copy back into an account. Run: node src/heal.check.mjs
import assert from 'node:assert/strict';
import {
  SYNCED_KEY, HOMEBREW_LISTS, keyOf, syncedIds, rememberSynced, restorable, removedElsewhere,
  homebrewIds, mergeHomebrew, putBack, describeRestore, REINDEX_KEY, reindexTried, markReindexTried
} from './heal.js';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); } };
};
const ids = (xs) => xs.map((x) => x.id);

/* ---- the snapshot: per account, per kind, replaced not added to ---- */
{
  const s = memory();
  assert.deepEqual(syncedIds('decks', 'u1', s), []);
  assert.equal(rememberSynced('decks', 'u1', ['a', 'b'], s), true);
  assert.deepEqual(syncedIds('decks', 'u1', s), ['a', 'b']);
  rememberSynced('decks', 'u1', ['b', 'c'], s);
  assert.deepEqual(syncedIds('decks', 'u1', s), ['b', 'c'], 'a new snapshot replaces the old');
  assert.deepEqual(syncedIds('decks', 'u2', s), [], 'another account has its own');
  rememberSynced('grounds', 'u1', ['g'], s);
  assert.deepEqual(syncedIds('decks', 'u1', s), ['b', 'c'], 'another kind does not disturb it');
  assert.equal(rememberSynced('decks', '', ['x'], s), false, 'no account, no record');
  s.setItem(SYNCED_KEY, 'not json');
  assert.deepEqual(syncedIds('decks', 'u1', s), [], 'a damaged record remembers nothing');
  assert.equal(rememberSynced('decks', 'u1', ['z'], { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }), false);
}

/* ---- what the account lost, and nobody else touched: everything goes back ---- */
{
  const local = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  // the account held all three, and now holds nothing: a wipe
  assert.deepEqual(ids(restorable(local, [], ['a', 'b', 'c'])), ['a', 'b', 'c']);
  // a browser that has never recorded a snapshot puts back whatever the account lacks
  assert.deepEqual(ids(restorable(local, [], [])), ['a', 'b', 'c']);
  assert.deepEqual(ids(restorable(local, [{ id: 'a' }], [])), ['b', 'c'], 'and only what it lacks');
}

/* ---- another device has added things since: what the account had is not forced back ---- */
{
  const local = [{ id: 'a' }, { id: 'b' }, { id: 'new-here' }];
  const remote = [{ id: 'a' }, { id: 'from-phone' }];      // the phone added one, and b is gone
  const known = ['a', 'b'];
  // b was the account's and has been removed there: not put back automatically
  assert.deepEqual(ids(restorable(local, remote, known)), ['new-here'], 'a thing made here still goes up');
  assert.deepEqual(ids(removedElsewhere(local, remote, known)), ['b'], 'and the removed one is reported');
  // the wipe case, with a phone that has since added something: the account is not empty, so no wipe is assumed
  assert.deepEqual(ids(restorable([{ id: 'a' }, { id: 'b' }], [{ id: 'from-phone' }], ['a', 'b'])), [],
    'the account holds something else now: nothing is forced back');
  assert.deepEqual(ids(removedElsewhere([{ id: 'a' }, { id: 'b' }], [{ id: 'from-phone' }], ['a', 'b'])), ['a', 'b'],
    'but both are offered back to the person');
}

/* ---- the account's version always stands ---- */
{
  const local = [{ id: 'a', name: 'old local name' }];
  const remote = [{ id: 'a', name: 'edited on the phone' }];
  assert.deepEqual(restorable(local, remote, []), [], 'same id: the account wins');
  assert.deepEqual(removedElsewhere(local, remote, ['a']), []);
}

/* ---- odd input ---- */
{
  assert.deepEqual(restorable(null, null, null), []);
  assert.deepEqual(restorable([null, 5, 'x', { id: 'ok' }], [], []), [{ id: 'ok' }].map((x) => x), 'junk is skipped');
  assert.deepEqual(ids(restorable([{ id: 'a' }, { id: 'a' }], [], [])), ['a'], 'a duplicate is sent once');
  // an entry with no id is told apart by its content
  const noId = [{ name: 'draft hull', space: 5 }];
  assert.equal(restorable(noId, [], []).length, 1);
  assert.equal(restorable(noId, [{ name: 'draft hull', space: 5 }], []).length, 0, 'the same content is the same entry');
  assert.equal(restorable(noId, [{ name: 'draft hull', space: 6 }], []).length, 1);
  // `usable` keeps out what is not whole: a deck with no map
  const decks = [{ id: 'd1', map: { cols: 3 } }, { id: 'd2' }];
  assert.deepEqual(ids(restorable(decks, [], [], (d) => Boolean(d.map))), ['d1']);
  assert.equal(keyOf({ id: 'q' }), 'q');
}

/* ---- the homebrew library ---- */
{
  const local = {
    hulls: [{ id: 'h1', name: 'My hull' }, { id: 'h2' }],
    components: [{ id: 'c1' }],
    encounters: [{ id: 'e1' }, { id: 'e2' }],
    endeavours: [], battlemaps: [{ id: 'old-deck' }], mapgrounds: [], voidcharts: [{ id: 'v1' }]
  };

  // after a wipe: the account's library is empty, the browser's is whole
  const wiped = mergeHomebrew({}, local, {});
  assert.deepEqual(ids(wiped.merged.hulls), ['h1', 'h2']);
  assert.deepEqual(ids(wiped.merged.encounters), ['e1', 'e2']);
  assert.deepEqual(ids(wiped.merged.voidcharts), ['v1']);
  assert.deepEqual(ids(wiped.merged.battlemaps), ['old-deck']);
  assert.equal(wiped.added, 7, 'seven entries came back');
  assert.deepEqual(wiped.left, []);
  for (const name of HOMEBREW_LISTS) assert.ok(Array.isArray(wiped.merged[name]), name);

  // after a wipe that this browser had a snapshot of
  const known = homebrewIds(local);
  const again = mergeHomebrew({ hulls: [], components: [], encounters: [], endeavours: [], battlemaps: [], mapgrounds: [], voidcharts: [] }, local, known);
  assert.equal(again.added, 7, 'a known-then-wiped library comes back whole');

  // another device added a hull and deleted one encounter since
  const cloud = {
    hulls: [{ id: 'h1', name: 'Renamed on the phone' }, { id: 'phone-hull' }],
    components: [{ id: 'c1' }], encounters: [{ id: 'e1' }],
    endeavours: [], battlemaps: [], mapgrounds: [], voidcharts: [{ id: 'v1' }]
  };
  const m = mergeHomebrew(cloud, local, known);
  assert.deepEqual(ids(m.merged.hulls), ['h1', 'phone-hull'], 'the phone\'s hull stays, and h1 is the phone\'s version');
  assert.equal(m.merged.hulls[0].name, 'Renamed on the phone');
  assert.deepEqual(ids(m.merged.encounters), ['e1'], 'the encounter another device removed is not forced back');
  assert.deepEqual(m.left.map((x) => `${x.list}:${x.item.id}`).sort(), ['encounters:e2', 'hulls:h2'], 'and is offered back');
  // the account holds no old decks at all any more though it did: that list was wiped, so it comes back
  assert.deepEqual(ids(m.merged.battlemaps), ['old-deck']);
  assert.equal(m.added, 1);

  // putting those back adds them and never doubles anything
  const back = putBack(m.merged, m.left);
  assert.deepEqual(ids(back.hulls), ['h1', 'phone-hull', 'h2']);
  assert.deepEqual(ids(back.encounters), ['e1', 'e2']);
  assert.deepEqual(ids(putBack(back, m.left).hulls), ['h1', 'phone-hull', 'h2'], 'twice is the same as once');
  assert.deepEqual(putBack(null, [{ list: 'nonsense', item: { id: 'x' } }]), {});

  // the inputs are not mutated
  assert.equal(cloud.hulls.length, 2);
  assert.equal(local.hulls.length, 2);

  // nothing in the browser, nothing to do
  assert.equal(mergeHomebrew(cloud, {}, {}).added, 0);
  assert.equal(mergeHomebrew(cloud, null, null).added, 0);
  assert.deepEqual(mergeHomebrew(null, null, null).merged.hulls, []);
}

/* ---- having looked for lost decks: once per browser, per account ---- */
{
  const s = memory();
  assert.equal(reindexTried('u1', s), false);
  assert.equal(markReindexTried('u1', s), true);
  assert.equal(reindexTried('u1', s), true);
  assert.equal(reindexTried('u2', s), false, 'another account has its own');
  assert.equal(markReindexTried('', s), false, 'no account, nothing recorded');
  s.setItem(REINDEX_KEY, 'not json');
  assert.equal(reindexTried('u1', s), false, 'a damaged record reads as not yet looked');
  assert.equal(markReindexTried('u1', s), true, 'and is replaced');
  s.setItem(REINDEX_KEY, '[1,2]');
  assert.equal(markReindexTried('u3', s), true);
  assert.equal(reindexTried('u3', s), true);
  assert.equal(reindexTried('u1', { getItem() { throw new Error('x'); } }), false);
}

/* ---- the sentence ---- */
assert.equal(describeRestore({}), '');
assert.match(describeRestore({ restored: 1 }), /^Put 1 entry from this browser back/);
assert.match(describeRestore({ restored: 3 }), /3 entries/);
assert.match(describeRestore({ left: 2 }), /2 entries in this browser's copy are no longer in your account/);
assert.match(describeRestore({ restored: 1, left: 1 }), /Put 1 entry.*1 entry in this browser's copy is no longer/);

console.log('heal: all checks passed');
