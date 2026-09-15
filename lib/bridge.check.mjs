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
  assignNpc, unassignNpc, npcSeats, playerSeats, seatForChar, isNpcSeat,
  MAX_NPC_SEATS,
  authorizeWrite, authorizeEvent, GM_DOC_FIELDS,
  newShip, applyPatch, applyWrite, appendLog, LOG_MAX,
  redactShip, redactDynasty
} from './bridge.js';
import { can } from '../src/shiproles.js';

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

dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus-Theta 7', role: 'enginseer' }).dynasty;
dyn = joinDynasty(dyn, { uid: 'player-2', charId: 'c2', name: 'Void-Eye Scion', role: 'helmsman' }).dynasty;

assert.equal(dyn.members.length, 2);
assert.equal(roleOf(dyn, 'player-1'), 'enginseer');
assert.equal(memberOf(dyn, 'player-2').name, 'Void-Eye Scion');
assert.equal(memberOf(dyn, 'nobody'), null);
assert.equal(roleOf(dyn, 'nobody'), '');

// Rejoining takes the same seat rather than adding a second one: a player who
// switches station is the same person at the same table.
dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus-Theta 7', role: 'ordnance' }).dynasty;
assert.equal(dyn.members.length, 2, 'still two seats');
assert.equal(roleOf(dyn, 'player-1'), 'ordnance');

{
  const left = leaveDynasty(dyn, 'player-2');
  assert.equal(left.members.length, 1);
  assert.equal(memberOf(left, 'player-2'), null);
}

/* ---- authorisation: two surfaces, governed differently ---- */

// The Enginseer's seat was changed to Ordnance above, so put it back.
dyn = joinDynasty(dyn, { uid: 'player-1', charId: 'c1', name: 'Linus', role: 'enginseer' }).dynasty;

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

// The Rogue Trader is the GM's character, so a player cannot take that
// station: they would be able to overrule every other player, which is not a
// station so much as a second GM.
{
  const asked = joinDynasty(dyn, {
    uid: 'newcomer', charId: 'c9', name: 'Cap', role: 'lordcaptain'
  });
  assert.equal(asked.error, 'gm_only_role');
  // refused outright rather than quietly seated somewhere else
  assert.equal(memberOf(asked.dynasty, 'newcomer'), null);

  // Any other station is fine.
  const ok = joinDynasty(dyn, {
    uid: 'newcomer', charId: 'c9', name: 'Cap', role: 'helmsman'
  });
  assert.equal(ok.error, null);
  assert.equal(roleOf(ok.dynasty, 'newcomer'), 'helmsman');

  // The GM may seat it, as an officer from their own roster.
  const seated = assignNpc(dyn, {
    uid: 'gm-1', charId: 'rt1', name: 'Ma’Kao', role: 'lordcaptain'
  });
  assert.equal(seated.error, null);
  assert.equal(seatForChar(seated.dynasty, 'rt1').role, 'lordcaptain');

  // And the GM themself is not blocked by the rule.
  const gmJoin = joinDynasty(dyn, {
    uid: 'gm-1', charId: 'rt1', name: 'Ma’Kao', role: 'lordcaptain'
  });
  assert.equal(gmJoin.error, null);
}

// The Lord-Captain's override reaches every department and still stops at the
// GM-only fields: commanding the ship is not authoring the encounter.
{
  assert.equal(can('lordcaptain', 'morale'), true);
  assert.equal(can('lordcaptain', 'phase'), false);
  assert.equal(can('lordcaptain', 'enemies'), false);
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

/* ======================= PLAYER SEATS vs NPC SEATS =======================
   One account holds one PLAYER seat but as many NPC seats as the GM wants.
   Keying every seat by uid alone made those mutually exclusive: the GM's
   second NPC replaced the first. */

{
  let d = newDynasty({ code: 'NPCTST', name: 'Test', ownerUid: 'gm-1' });
  d = joinDynasty(d, { uid: 'p1', charId: 'c1', name: 'Linus', role: 'enginseer' }).dynasty;

  // The GM seats three officers from their own roster.
  for (const [charId, name, role] of [
    ['npc1', 'Bosun Vannick', 'firstofficer'],
    ['npc2', 'Master Yuld', 'helmsman'],
    ['npc3', 'Chirurgeon Sesk', 'chirurgeon']
  ]) {
    const r = assignNpc(d, { uid: 'gm-1', charId, name, role });
    assert.equal(r.error, null, charId);
    d = r.dynasty;
  }

  assert.equal(npcSeats(d).length, 3, 'all three stay seated');
  assert.deepEqual(npcSeats(d).map((m) => m.charId), ['npc1', 'npc2', 'npc3']);
  assert.equal(playerSeats(d).length, 1, 'and the player is still there');

  // Each is individually addressable and holds its own station.
  assert.equal(seatForChar(d, 'npc2').role, 'helmsman');
  assert.equal(seatForChar(d, 'npc2').name, 'Master Yuld');
  assert.equal(isNpcSeat(seatForChar(d, 'npc2')), true);
  assert.equal(isNpcSeat(seatForChar(d, 'c1')), false);
  assert.equal(seatForChar(d, 'nobody'), null);

  // Re-assigning one moves it rather than duplicating it.
  d = assignNpc(d, { uid: 'gm-1', charId: 'npc2', name: 'Master Yuld', role: 'ordnance' }).dynasty;
  assert.equal(npcSeats(d).length, 3, 'still three');
  assert.equal(seatForChar(d, 'npc2').role, 'ordnance', 'moved station');

  // The GM's own membership is not confused by the officers they run: an NPC
  // seat is not the GM's seat.
  assert.equal(memberOf(d, 'gm-1'), null, 'running NPCs is not holding a seat');
  assert.equal(isGm(d, 'gm-1'), true, 'but they are still the GM');
  assert.equal(roleOf(d, 'gm-1'), '');

  // A player rejoining replaces only their own seat and leaves the NPCs be.
  d = joinDynasty(d, { uid: 'p1', charId: 'c1', name: 'Linus', role: 'ordnance' }).dynasty;
  assert.equal(playerSeats(d).length, 1);
  assert.equal(npcSeats(d).length, 3, 'a player rejoining does not evict the officers');
  assert.equal(roleOf(d, 'p1'), 'ordnance');

  // Nor does leaving.
  const left = leaveDynasty(d, 'p1');
  assert.equal(playerSeats(left).length, 0);
  assert.equal(npcSeats(left).length, 3, 'leaving does not strip the bridge');

  // Unassigning removes exactly one.
  d = unassignNpc(d, 'npc2');
  assert.equal(npcSeats(d).length, 2);
  assert.deepEqual(npcSeats(d).map((m) => m.charId), ['npc1', 'npc3']);

  // A stray charId cannot eject a player, even one whose charId matches.
  const stillThere = unassignNpc(d, 'c1');
  assert.equal(playerSeats(stillThere).length, 1, 'a player seat is not an NPC seat');
  assert.equal(roleOf(stillThere, 'p1'), 'ordnance');

  // Unassigning something absent is a no-op rather than an error.
  assert.equal(npcSeats(unassignNpc(d, 'never-seated')).length, 2);
  assert.equal(npcSeats(unassignNpc(d, null)).length, 2);
}

/* ---- a character id is validated, and the seat count is capped ---- */

{
  let d = newDynasty({ code: 'CAPTST', name: 'Cap', ownerUid: 'gm-1' });

  for (const bad of [null, undefined, '', 'a:b', '../x', 'x'.repeat(65), 7, {}]) {
    const r = assignNpc(d, { uid: 'gm-1', charId: bad, name: 'X', role: '' });
    assert.equal(r.error, 'bad_character_id', JSON.stringify(bad));
    assert.equal(npcSeats(r.dynasty).length, 0);
  }

  for (let i = 0; i < MAX_NPC_SEATS; i++) {
    const r = assignNpc(d, { uid: 'gm-1', charId: 'npc' + i, name: 'N' + i, role: '' });
    assert.equal(r.error, null, 'seat ' + i);
    d = r.dynasty;
  }
  assert.equal(npcSeats(d).length, MAX_NPC_SEATS);

  const over = assignNpc(d, { uid: 'gm-1', charId: 'one-too-many', name: 'X', role: '' });
  assert.equal(over.error, 'too_many_npcs');
  assert.equal(npcSeats(over.dynasty).length, MAX_NPC_SEATS, 'and nothing was added');

  // ...but moving one already seated is still allowed at the cap
  const moved = assignNpc(d, { uid: 'gm-1', charId: 'npc0', name: 'N0', role: 'helmsman' });
  assert.equal(moved.error, null, 'a reassignment is not a new seat');
  assert.equal(seatForChar(moved.dynasty, 'npc0').role, 'helmsman');
}

/* ---- the crew can see who holds which station, NPCs included ---- */

{
  let d = newDynasty({ code: 'SEEING', name: 'S', ownerUid: 'gm-1' });
  d = joinDynasty(d, { uid: 'p1', charId: 'c1', name: 'Linus', role: 'enginseer' }).dynasty;
  d = assignNpc(d, { uid: 'gm-1', charId: 'npc1', name: 'Bosun', role: 'firstofficer' }).dynasty;

  const crewView = redactDynasty(d, { isGm: false });
  assert.equal(crewView.members.length, 2);
  const bosun = crewView.members.find((m) => m.charId === 'npc1');
  assert.equal(bosun.name, 'Bosun');
  assert.equal(bosun.role, 'firstofficer');
  assert.equal(bosun.npc, true, 'and marked as an officer rather than a player');
  assert.equal(bosun.uid, undefined, 'without giving away the account');
  assert.equal(crewView.members.find((m) => m.charId === 'c1').npc, false);
}

console.log('bridge: seat checks passed');
