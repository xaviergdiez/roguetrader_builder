// Self-check for moving a browser's map library up to the account. Run: node src/localmove.check.mjs
import assert from 'node:assert/strict';
import { MOVED_KEY, movedIds, markMoved, toMove, describeMove } from './localmove.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
};

/* ---- what is worth sending ---- */
const g = (id, texture = 'data:image/jpeg;base64,AA') => ({ id, texture });
assert.deepEqual(toMove([g('a'), g('b')], [{ id: 'a' }]).map((x) => x.id), ['b'], 'the account already has a');
assert.deepEqual(toMove([g('a'), g('b')], [], ['a']).map((x) => x.id), ['b'], 'a was moved before; leave it be');
assert.deepEqual(toMove([g('a'), g('a')], []).map((x) => x.id), ['a'], 'a duplicate in the browser goes once');
assert.deepEqual(toMove([g('a', '')], [], [], (x) => Boolean(x.texture)), [], 'a ground with no floor is not whole');
assert.deepEqual(toMove([null, {}, { id: 3 }, { id: '' }], []), [], 'rubbish is skipped, not thrown on');
assert.deepEqual(toMove(null, null), [], 'nothing at all is fine');

/* ---- remembering ---- */
{
  const s = memory();
  assert.deepEqual(movedIds('decks', 'u1', s), []);
  assert.equal(markMoved('decks', 'u1', ['d1', 'd2'], s), true);
  assert.equal(markMoved('decks', 'u1', ['d2', 'd3'], s), true);
  assert.deepEqual(movedIds('decks', 'u1', s), ['d1', 'd2', 'd3'], 'merged, no repeats');
  assert.deepEqual(movedIds('grounds', 'u1', s), [], 'decks and grounds are remembered apart');
  assert.deepEqual(movedIds('decks', 'u2', s), [], 'and so are accounts');
  markMoved('grounds', 'u1', ['g1'], s);
  assert.deepEqual(movedIds('decks', 'u1', s), ['d1', 'd2', 'd3'], 'saving grounds leaves the decks');
  assert.equal(markMoved('decks', '', ['x'], s), false, 'no account, nothing to record against');
}
{
  const s = memory();
  const ids = Array.from({ length: 500 }, (_, i) => 'd' + i);
  markMoved('decks', 'u1', ids, s);
  const kept = movedIds('decks', 'u1', s);
  assert.equal(kept.length, 400, 'only the newest are kept');
  assert.equal(kept[kept.length - 1], 'd499');
}
{
  const s = memory();
  s.setItem(MOVED_KEY, '{not json');
  assert.deepEqual(movedIds('decks', 'u1', s), [], 'a damaged record is an empty one');
  assert.equal(markMoved('decks', 'u1', ['d1'], s), true, 'and is written over');
  assert.deepEqual(movedIds('decks', 'u1', s), ['d1']);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(markMoved('decks', 'u1', ['d1'], full), false, 'a browser that will not keep it says so');
  assert.deepEqual(movedIds('decks', 'u1', null), [], 'no storage at all remembers nothing');
}

/* ---- a deleted deck does not come back ---- */
{
  const s = memory();
  const local = [{ id: 'keep' }, { id: 'gone' }];
  // First sign-in: the account has neither, both go up and are noted.
  assert.deepEqual(toMove(local, [], movedIds('decks', 'u1', s)).map((x) => x.id), ['keep', 'gone']);
  markMoved('decks', 'u1', ['keep', 'gone'], s);
  // Later the account deletes "gone" from another device. The browser still has it.
  assert.deepEqual(toMove(local, [{ id: 'keep' }], movedIds('decks', 'u1', s)), [], 'it is not put back');
  // A deck made signed out afterwards still goes.
  assert.deepEqual(toMove([...local, { id: 'new' }], [{ id: 'keep' }], movedIds('decks', 'u1', s)).map((x) => x.id), ['new']);
}

/* ---- saying so ---- */
assert.equal(describeMove({}), '');
assert.equal(describeMove({ decks: 1 }), 'Moved 1 deck from this browser to your account.');
assert.equal(describeMove({ decks: 2, grounds: 1 }), 'Moved 2 decks and 1 environment from this browser to your account.');
assert.equal(describeMove({ left: 1 }), '1 item could not be moved and is still only in this browser.');
assert.equal(describeMove({ grounds: 3, left: 2 }),
  'Moved 3 environments from this browser to your account. 2 items could not be moved and are still only in this browser.');

console.log('localmove checks passed');
