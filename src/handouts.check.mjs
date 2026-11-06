// Self-check for handouts.js and the bridge's handling of them. Run: node src/handouts.check.mjs
import assert from 'node:assert/strict';
import {
  HANDOUT_KINDS, kindById, readHandout, readHandouts, newHandout, handoutLabel, readRecipients, readDelivered,
  handoutFor, MAX_HANDOUTS, MAX_TEXT, MAX_DELIVERED, HANDOUT_IMAGE, HANDOUT_ID
} from './handouts.js';
import { addHandout, withdrawHandout, mayReadHandout, redactShip, applyWrite, newShip, handoutImageKey } from '../lib/bridge.js';

/* ---- the GM's copy ---- */
assert.equal(HANDOUT_KINDS.length, 5);
assert.equal(kindById('nope').id, 'dataslate');
{
  const h = newHandout('vox');
  assert.match(h.id, HANDOUT_ID);
  assert.equal(h.kind, 'vox');
  assert.equal(handoutLabel(h), 'Vox intercept', 'no title: called what it is');
  assert.equal(handoutLabel({ ...h, title: 'Channel 9' }), 'Channel 9');
}
assert.equal(readHandout({ id: 'x', title: 'a' }), null, 'a real id or nothing');
assert.deepEqual(readHandout({ id: 'habc123', kind: 'pict', title: 'The suspect', text: 'Lower hab-stack 7', image: 'hpic-a1', imageName: 'face.png', extra: 1 }),
  { id: 'habc123', kind: 'pict', title: 'The suspect', text: 'Lower hab-stack 7', image: 'hpic-a1', imageName: 'face.png' });
assert.equal(readHandout({ id: 'habc123', image: '../../etc' }).image, null);
assert.equal(readHandout({ id: 'habc123', text: 'x'.repeat(9000) }).text.length, MAX_TEXT);
{
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 'h' + String(i).padStart(5, '0') }));
  assert.equal(readHandouts([...many, many[0], null]).length, MAX_HANDOUTS);
}

/* ---- the table's copy ---- */
assert.equal(readRecipients('all'), 'all');
assert.deepEqual(readRecipients(['c1', 'c1', 'c2', 7, '../x']), ['c1', 'c2']);
assert.deepEqual(readRecipients('c1'), ['c1']);
assert.equal(readRecipients([]), null);
assert.equal(readDelivered({ id: 'habc1', to: [] }), null, 'for nobody is no handout');
assert.equal(handoutFor({ to: 'all' }, []), true);
assert.equal(handoutFor({ to: ['c1'] }, ['c2']), false);
assert.equal(handoutFor({ to: ['c1', 'c3'] }, ['c3']), true);
assert.ok(HANDOUT_IMAGE.test('data:image/jpeg;base64,AAAA'));
assert.ok(!HANDOUT_IMAGE.test('data:image/svg+xml;base64,AAAA'), 'no scripts in a picture');
assert.ok(!HANDOUT_IMAGE.test('data:image/png;base64,AA"><script>'));

/* ---- on the bridge ---- */
const dynasty = { ownerUid: 'gm', members: [{ uid: 'p1', charId: 'c1', name: 'Vex' }, { uid: 'p2', charId: 'c2', name: 'Orla' }] };
let ship = newShip('ABCDEF');
{
  const r = addHandout(ship, dynasty, { to: ['c1'], kind: 'dataslate', title: 'Manifest', text: 'Shipment diverted', hasImage: true });
  assert.equal(r.error, null);
  assert.equal(r.ship.rev, ship.rev + 1, 'the poll sees it');
  assert.equal(r.ship.handouts[0].title, 'Manifest');
  assert.equal(r.ship.handouts[0].hasImage, true);
  assert.equal('image' in r.ship.handouts[0], false, 'the picture is never in the document');
  ship = r.ship;
}
assert.equal(addHandout(ship, dynasty, { to: ['c9'], title: 'x' }).error, 'not_at_this_table');
assert.equal(addHandout(ship, dynasty, { to: 'all', title: ' ', text: '' }).error, 'empty_handout');
ship = addHandout(ship, dynasty, { to: 'all', kind: 'vox', text: 'Throne-damned static' }).ship;
// Each player is sent only theirs, and the whole table's.
{
  const vex = redactShip(ship, { isGm: false, charIds: ['c1'] });
  const orla = redactShip(ship, { isGm: false, charIds: ['c2'] });
  assert.equal(vex.handouts.length, 2);
  assert.deepEqual(orla.handouts.map((h) => h.kind), ['vox']);
  assert.equal(redactShip(ship, { isGm: true }).handouts.length, 2);
  const id = vex.handouts.find((h) => h.kind === 'dataslate').id;
  assert.ok(mayReadHandout(ship, id, { charIds: ['c1'] }));
  assert.equal(mayReadHandout(ship, id, { charIds: ['c2'] }), null, 'a picture for one is not fetched by another');
  assert.ok(mayReadHandout(ship, id, { isGm: true }));
  assert.equal(handoutImageKey('ABCDEF', id), `rt:handout:ABCDEF:${id}`);
  // A GM write cannot overwrite them: they are appended, never written.
  assert.equal(applyWrite(ship, { doc: { handouts: [] } }).handouts.length, 2);
  // Taken back.
  const w = withdrawHandout(ship, id);
  assert.equal(w.removed.id, id);
  assert.equal(w.ship.handouts.length, 1);
  assert.equal(withdrawHandout(ship, 'hnothere').removed, null);
}
// The newest MAX_DELIVERED are kept, and the pictures of those pushed out are named.
{
  let s2 = newShip('ABCDEF');
  let dropped = [];
  for (let i = 0; i < MAX_DELIVERED + 3; i++) {
    const r = addHandout(s2, dynasty, { to: 'all', title: 'n' + i, hasImage: i < 2 });
    s2 = r.ship; dropped = dropped.concat(r.dropped);
  }
  assert.equal(s2.handouts.length, MAX_DELIVERED);
  assert.equal(s2.handouts[0].title, 'n' + (MAX_DELIVERED + 2), 'newest first');
  assert.equal(dropped.length, 2, 'both pictures went with their handouts');
}

console.log('handouts.js OK');
