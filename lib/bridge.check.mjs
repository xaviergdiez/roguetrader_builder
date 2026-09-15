// Self-check for the shared bridge. Run: node lib/bridge.check.mjs
//
// The authorisation and redaction halves are the ones that matter: permissive
// in the wrong direction lets a gunner repair the drive or read an unscanned
// enemy's hull, and strict in the wrong direction silently swallows a legal
// order.
import assert from 'node:assert/strict';
import {
  dynastyKey, shipKey, newCode, CODE_RE, CODE_LENGTH, normaliseCode,
  newDynasty, isGm, memberOf, roleOf, joinDynasty, leaveDynasty,
  authorizeWrite, authorizeEvent, GM_DOC_FIELDS,
  newShip, applyPatch, applyWrite, appendLog, LOG_MAX,
  redactShip, redactDynasty
} from './bridge.js';

/* ---- keys stay inside this build's namespace ---- */

assert.equal(dynastyKey('AB3K9P'), 'rt:dyn:AB3K9P');
assert.equal(shipKey('AB3K9P'), 'rt:ship:AB3K9P');

/* ---- codes are read aloud, so they are typo-tolerant on the way in ---- */

{
  // A deterministic "random" walks the alphabet.
  let i = 0;
  const code = newCode(() => (i++ * 7 % 32) / 32);
  assert.equal(code.length, CODE_LENGTH);
  assert.ok(CODE_RE.test(code), code);

  for (let n = 0; n < 200; n++) {
    const c = newCode();
    assert.ok(CODE_RE.test(c), c);
    // the characters that get misheard are left out
    assert.equal(/[IO01]/.test(c), false, c);
  }
}

assert.equal(normaliseCode(' ab3k9p '), 'AB3K9P', 'trimmed and upper-cased');
assert.equal(normaliseCode('AB3-K9P'), 'AB3K9P', 'punctuation dropped');
assert.equal(normaliseCode('AB3K9'), null, 'too short');
assert.equal(normaliseCode('AB3K9PQ'), null, 'too long');
assert.equal(normaliseCode('AB3K9O'), null, 'O is not in the alphabet');
assert.equal(normaliseCode(''), null);
assert.equal(normaliseCode(null), null);
// a code is concatenated into a Redis key, so nothing else may get through
assert.equal(normaliseCode('rt:dyn:*'), null);
assert.equal(normaliseCode('../../etc'), null);

/* ---- the creator is the GM, permanently ---- */

let dyn = newDynasty({ code: 'AB3K9P', name: 'Ma’Kao', ownerUid: 'gm-1',
  ownerEmail: 'gm@example.com' });

assert.equal(dyn.code, 'AB3K9P');
assert.equal(dyn.name, 'Ma’Kao');
assert.equal(isGm(dyn, 'gm-1'), true);
assert.equal(isGm(dyn, 'player-1'), false);
assert.equal(isGm(dyn, undefined), false);
assert.equal(isGm(null, 'gm-1'), false);
assert.equal(newDynasty({ code: 'X', name: '  ', ownerUid: 'u' }).name, 'An unnamed dynasty');

/* ---- joining ---- */

dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus-Theta 7', role: 'enginseer' });
dyn = joinDynasty(dyn, { uid: 'player-2', charId: 'c2', name: 'Void-Eye Scion', role: 'helmsman' });

assert.equal(dyn.members.length, 2);
assert.equal(roleOf(dyn, 'player-1'), 'enginseer');
assert.equal(memberOf(dyn, 'player-2').name, 'Void-Eye Scion');
assert.equal(memberOf(dyn, 'nobody'), null);
assert.equal(roleOf(dyn, 'nobody'), '');

// Rejoining takes the same seat rather than adding a second one: a player who
// switches station is the same person at the same table.
dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus-Theta 7', role: 'ordnance' });
assert.equal(dyn.members.length, 2, 'still two seats');
assert.equal(roleOf(dyn, 'player-1'), 'ordnance');

{
  const left = leaveDynasty(dyn, 'player-2');
  assert.equal(left.members.length, 1);
  assert.equal(memberOf(left, 'player-2'), null);
}

/* ---- authorisation: two surfaces, governed differently ---- */

// The Enginseer's seat was changed to Ordnance above, so put it back.
dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus', role: 'enginseer' });

{
  const ok = authorizeWrite(dyn, 'player-1', { vitals: ['hullIntegrity', 'fires'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.denied, []);
  assert.equal(ok.isGm, false);
  assert.equal(ok.role, 'enginseer');

  // engineering does not steer
  const no = authorizeWrite(dyn, 'player-1', { vitals: ['heading'] });
  assert.equal(no.ok, false);
  assert.deepEqual(no.denied, ['heading']);
  assert.equal(no.reason, 'not_your_station');

  // all or nothing: one bad field refuses the whole write
  const mixed = authorizeWrite(dyn, 'player-1', { vitals: ['hullIntegrity', 'heading'] });
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.denied, ['heading']);

  // nothing asked for is allowed, and writes nothing
  assert.equal(authorizeWrite(dyn, 'player-1', {}).ok, true);
  assert.equal(authorizeWrite(dyn, 'player-1').ok, true);
}

// The document surface is the GM's alone. A station never owns the blueprint
// or the NPC fleet, however senior it is.
{
  assert.deepEqual(GM_DOC_FIELDS, ['blueprint', 'fleet', 'combat']);

  const gm = authorizeWrite(dyn, 'gm-1', { doc: ['blueprint', 'fleet', 'combat'] });
  assert.equal(gm.ok, true);
  assert.equal(gm.isGm, true);
  assert.equal(gm.role, '', 'a GM with no seat is still the GM');

  const player = authorizeWrite(dyn, 'player-1', { doc: ['fleet'] });
  assert.equal(player.ok, false);
  assert.deepEqual(player.denied, ['fleet']);

  // An unrecognised document field is refused even for the GM: the ship has a
  // known shape and a typo should not add a key to it. This is the check that
  // the first push failed — it sent blueprint and fleet as if they were state
  // fields and was refused for everyone.
  const typo = authorizeWrite(dyn, 'gm-1', { doc: ['bluprint'] });
  assert.equal(typo.ok, false);
  assert.deepEqual(typo.denied, ['bluprint']);

  // and the mixed write the panel actually makes is allowed for the GM
  const push = authorizeWrite(dyn, 'gm-1', {
    doc: ['blueprint', 'fleet', 'combat'],
    vitals: ['hullIntegrity', 'morale', 'population']
  });
  assert.equal(push.ok, true);
}

// The GM needs no station and may write any state field.
{
  const g = authorizeWrite(dyn, 'gm-1', {
    vitals: ['hullIntegrity', 'heading', 'phase', 'enemies']
  });
  assert.equal(g.ok, true);
}

// Signed in is not at the table.
{
  const stranger = authorizeWrite(dyn, 'player-99', { vitals: ['morale'] });
  assert.equal(stranger.ok, false);
  assert.equal(stranger.reason, 'not_a_member');
}

// GM-only state fields stay closed to a player, whatever their station —
// including the Lord-Captain's override.
{
  const d2 = joinDynasty(dyn, { uid: 'captain', charId: 'c9', name: 'Cap', role: 'lordcaptain' });
  assert.equal(authorizeWrite(d2, 'captain', { vitals: ['morale'] }).ok, true);
  assert.equal(authorizeWrite(d2, 'captain', { vitals: ['phase'] }).ok, false,
    'the Captain commands the ship, not the encounter');
  assert.equal(authorizeWrite(d2, 'captain', { doc: ['fleet'] }).ok, false);
}

/* ---- events belong to the GM alone ---- */

assert.equal(authorizeEvent(dyn, 'gm-1', 'warp_storm').ok, true);
assert.equal(authorizeEvent(dyn, 'player-1', 'fire').ok, false, 'a player cannot start a fire');
assert.equal(authorizeEvent(dyn, 'player-1', 'fire').reason, 'gm_only');
assert.equal(authorizeEvent(dyn, 'gm-1', 'nonsense').ok, false);
assert.equal(authorizeEvent(dyn, 'gm-1', 'nonsense').reason, 'unknown_event');

/* ---- rev is what makes polling cheap ---- */

{
  let ship = newShip('AB3K9P');
  assert.equal(ship.rev, 1);
  assert.equal(ship.combat.phase, 'extended');

  const before = JSON.stringify(ship);
  const next = applyPatch(ship, { vitals: { hullIntegrity: 52 } });
  assert.equal(next.rev, 2, 'every write bumps rev');
  assert.equal(next.vitals.hullIntegrity, 52);
  assert.equal(next.code, 'AB3K9P', 'the code is not patchable');
  assert.equal(JSON.stringify(ship), before, 'the original is untouched');

  // a patch cannot rewrite its own rev to something stale
  assert.equal(applyPatch(next, { rev: 1 }).rev, 3);
  // patching a ship that did not exist yet still counts as a write
  assert.equal(applyPatch(null, { vitals: null }).rev, 2);
}

/* ---- applyWrite merges vitals key by key ---- */

{
  const ship = { ...newShip('AB3K9P'), vitals: { hullIntegrity: 60, morale: 100, population: 100 } };

  // Two stations writing different vitals in the same turn must not clobber
  // each other: sending the whole object would make the later write win.
  const a = applyWrite(ship, { vitals: { hullIntegrity: 52 } });
  const b = applyWrite(a, { vitals: { morale: 90 } });
  assert.equal(b.vitals.hullIntegrity, 52, 'the earlier write survives');
  assert.equal(b.vitals.morale, 90);
  assert.equal(b.vitals.population, 100, 'and so does what neither touched');
  assert.equal(b.rev, 3);

  // Document fields replace wholesale, which is right: a fleet is the fleet.
  const withFleet = applyWrite(ship, { doc: { fleet: [{ id: 'e1' }] } });
  assert.deepEqual(withFleet.fleet, [{ id: 'e1' }]);
  // and an unknown document key is dropped rather than written
  const junk = applyWrite(ship, { doc: { nonsense: 1 } });
  assert.equal('nonsense' in junk, false);
  assert.equal(junk.rev, 2, 'it still counts as a write');

  assert.equal(applyWrite(ship, {}).rev, 2);
  assert.equal(applyWrite(null, { vitals: { morale: 5 } }).vitals.morale, 5);
}

/* ---- the log is bounded ---- */

{
  let ship = newShip('AB3K9P');
  for (let i = 0; i < LOG_MAX + 10; i++) ship = appendLog(ship, { text: 'line ' + i });
  assert.equal(ship.log.length, LOG_MAX);
  assert.equal(ship.log[0].text, 'line ' + (LOG_MAX + 9), 'newest first');
  assert.ok(ship.log[0].at > 0);
}

/* ---- REDACTION: an unscanned enemy gives up nothing ---- */

{
  const ship = {
    ...newShip('AB3K9P'),
    fleet: [
      { id: 'e1', name: 'Hazeroth-class', hullId: 'hull-hazeroth',
        vitals: { hullIntegrity: 32, morale: 100 }, voidShields: 1,
        weapons: ['weap-macrocannon-mars'], turretRating: 1 },
      { id: 'e2', name: 'Sword-class', hullId: 'hull-sword', scanned: true,
        vitals: { hullIntegrity: 35 }, voidShields: 1,
        weapons: ['weap-lance-starbreaker'], turretRating: 2 }
    ]
  };

  const gmView = redactShip(ship, { isGm: true });
  assert.equal(gmView.fleet[0].vitals.hullIntegrity, 32, 'the GM sees everything');
  assert.equal(gmView, ship, 'and gets the object through unchanged');

  const crewView = redactShip(ship, { isGm: false });
  const unscanned = crewView.fleet[0];
  assert.equal(unscanned.name, 'Hazeroth-class', 'the crew can see what it is');
  assert.equal(unscanned.hullId, 'hull-hazeroth');
  assert.equal(unscanned.unscanned, true, 'and why they have no numbers');
  assert.equal(unscanned.vitals, undefined, 'but not its hull integrity');
  assert.equal(unscanned.voidShields, undefined);
  assert.equal(unscanned.weapons, undefined);
  assert.equal(unscanned.turretRating, undefined);

  // An Active Augury has been spent on the second one, so it gives up its
  // real numbers.
  assert.equal(crewView.fleet[1].vitals.hullIntegrity, 35);
  assert.equal(crewView.fleet[1].weapons.length, 1);

  // The crew's own ship is never redacted.
  const own = redactShip({ ...ship, vitals: { hullIntegrity: 60 } }, { isGm: false });
  assert.equal(own.vitals.hullIntegrity, 60);

  assert.equal(redactShip(null), null);
  assert.deepEqual(redactShip({ ...newShip('X'), fleet: [] }, {}).fleet, []);
}

/* ---- the seat list is public; the GM's email is not ---- */

{
  const crew = redactDynasty(dyn, { isGm: false });
  assert.equal(crew.code, 'AB3K9P');
  assert.equal(crew.ownerEmail, undefined, 'the table does not need the GM’s email');
  assert.equal(crew.members[0].uid, undefined, 'nor other players’ account ids');
  assert.ok(crew.members.every((m) => m.name && 'role' in m));

  const gmv = redactDynasty(dyn, { isGm: true });
  assert.equal(gmv.ownerEmail, 'gm@example.com');
  assert.ok(gmv.members.every((m) => m.uid));

  assert.equal(redactDynasty(null), null);
}

console.log('bridge: all checks passed');
