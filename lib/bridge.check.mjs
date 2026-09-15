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
  authorizePatch, authorizeEvent,
  newShip, applyPatch, appendLog, LOG_MAX,
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

/* ---- authorisation: station decides the fields ---- */

// The Enginseer's seat was changed to Ordnance above, so put it back.
dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus', role: 'enginseer' });

{
  const ok = authorizePatch(dyn, 'player-1', ['hullIntegrity', 'fires']);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.denied, []);
  assert.equal(ok.isGm, false);
  assert.equal(ok.role, 'enginseer');

  // engineering does not steer
  const no = authorizePatch(dyn, 'player-1', ['heading']);
  assert.equal(no.ok, false);
  assert.deepEqual(no.denied, ['heading']);
  assert.equal(no.reason, 'forbidden_fields');

  // all or nothing: one bad field refuses the whole payload
  const mixed = authorizePatch(dyn, 'player-1', ['hullIntegrity', 'heading']);
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.denied, ['heading']);
}

// The GM needs no station and may write anything.
{
  const g = authorizePatch(dyn, 'gm-1', ['hullIntegrity', 'heading', 'phase', 'enemies']);
  assert.equal(g.ok, true);
  assert.equal(g.isGm, true);
  assert.equal(g.role, '', 'a GM with no seat is still the GM');
}

// Signed in is not at the table.
{
  const stranger = authorizePatch(dyn, 'player-99', ['morale']);
  assert.equal(stranger.ok, false);
  assert.equal(stranger.reason, 'not_a_member');
}

// GM-only fields stay closed to a player, whatever their station — including
// the Lord-Captain's override.
{
  let d2 = joinDynasty(dyn, { uid: 'captain', charId: 'c9', name: 'Cap', role: 'lordcaptain' });
  assert.equal(authorizePatch(d2, 'captain', ['morale']).ok, true);
  assert.equal(authorizePatch(d2, 'captain', ['phase']).ok, false,
    'the Captain commands the ship, not the encounter');
  assert.equal(authorizePatch(d2, 'captain', ['enemies']).ok, false);
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
