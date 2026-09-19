// Self-check for ship roles and permissions. Run: node src/shiproles.check.mjs
//
// This is the file that matters most of the three: a permission table that is
// wrong in the permissive direction lets a gunner repair the drive, and one
// that is wrong in the strict direction silently swallows a legal order.
import assert from 'node:assert/strict';
import {
  SHIP_ROLES, SHIP_FIELDS, GM_ONLY_FIELDS, GM_EVENTS, eventById, canTriggerEvent,
  roleById, rolesForCareer, can, deniedWrites, crewTarget,
  backsIntoIt, evasionPenalty, lockBonus
} from './shiproles.js';

/* ---- the table is well formed ---- */

assert.equal(SHIP_ROLES.length, 10);
const ids = SHIP_ROLES.map((r) => r.id);
assert.equal(new Set(ids).size, ids.length, 'role ids are unique');
// A duplicate is harmless to includes() and still a mistake — it was how
// diceModifiers ended up in the list twice.
assert.equal(new Set(SHIP_FIELDS).size, SHIP_FIELDS.length, 'ship fields are unique');

for (const r of SHIP_ROLES) {
  assert.ok(r.name && r.career && r.department, r.id + ': identity');
  assert.ok(r.fields.length, r.id + ': owns at least one field');
  // every field a role claims must be a real one, or `can` will refuse an
  // order the table meant to allow
  for (const f of r.fields) {
    assert.ok(f === '*' || SHIP_FIELDS.includes(f), `${r.id}: unknown field ${f}`);
  }
  assert.ok(r.action && r.action.name && r.action.test && r.action.effect,
    r.id + ': signature action');
  // an action must only write fields its own role owns, or the role could not
  // perform its own signature move
  assert.deepEqual(deniedWrites(r.id, r.action.writes), [],
    `${r.id}: cannot perform its own action`);
}

// Only the Lord-Captain overrides everything. If a second role gained '*' the
// whole matrix would stop meaning anything.
assert.deepEqual(SHIP_ROLES.filter((r) => r.fields.includes('*')).map((r) => r.id),
  ['lordcaptain']);

/* ---- permissions ---- */

assert.equal(can('enginseer', 'hullIntegrity'), true);
assert.equal(can('enginseer', 'componentStatus'), true);
assert.equal(can('enginseer', 'heading'), false, 'engineering does not steer');
assert.equal(can('helmsman', 'heading'), true);
assert.equal(can('helmsman', 'hullIntegrity'), false, 'the helm does not repair');
assert.equal(can('ordnance', 'targetLocks'), true);
assert.equal(can('ordnance', 'power'), false, 'gunnery does not reroute power');
assert.equal(can('chirurgeon', 'population'), true);

// The Captain can countermand any department — but the encounter is not a
// department, so the GM-only fields stay closed even to the override.
for (const f of SHIP_FIELDS) {
  assert.equal(can('lordcaptain', f), !GM_ONLY_FIELDS.includes(f), 'captain: ' + f);
}

// Unknown roles and unknown fields are refused rather than waved through.
assert.equal(can('stowaway', 'morale'), false);
assert.equal(can(undefined, 'morale'), false);
assert.equal(can('lordcaptain', 'selfDestruct'), false, 'even the captain cannot write an unknown field');
assert.equal(can('enginseer', ''), false);

/* ---- a payload is allowed or refused as a whole ---- */

// Morale is shared by the First Officer, the High Factotum and the Chirurgeon;
// hull integrity belongs to the Enginseer alone.
assert.deepEqual(deniedWrites('factotum', ['morale']), []);
assert.deepEqual(deniedWrites('factotum', ['morale', 'hullIntegrity']), ['hullIntegrity']);
assert.deepEqual(deniedWrites('enginseer', ['hullIntegrity', 'fires']), []);
assert.deepEqual(deniedWrites('lordcaptain', ['morale', 'speed', 'targetLocks']), []);
assert.deepEqual(deniedWrites('helmsman', []), []);
assert.deepEqual(deniedWrites('helmsman', undefined), []);

/* ---- career suggestions ---- */

assert.deepEqual(rolesForCareer('Rogue Trader').map((r) => r.id), ['lordcaptain']);
assert.deepEqual(rolesForCareer('Explorator').map((r) => r.id), ['enginseer']);
// a career the sheet spells with a parenthetical still matches
assert.deepEqual(rolesForCareer('Explorator (Heretek)').map((r) => r.id), ['enginseer']);
assert.deepEqual(rolesForCareer('Navigator (Magisterial House)').map((r) => r.id), ['warpguide']);
// Void-Master fills two stations, so both are offered
assert.deepEqual(rolesForCareer('Void-Master').map((r) => r.id), ['helmsman', 'etherics']);
// A Seneschal fits two stations: the matrix lists the First Officer's career
// as "Seneschal / Any", so both are offered and the player picks.
assert.deepEqual(rolesForCareer('Seneschal').map((r) => r.id),
  ['firstofficer', 'factotum']);
assert.deepEqual(rolesForCareer('Eldar Corsair'), [], 'no station is implied');
assert.deepEqual(rolesForCareer(''), []);
assert.deepEqual(rolesForCareer(null), []);

/* ---- delegating to the crew ---- */

assert.equal(crewTarget(30), 30);              // Competent, unbuffed
assert.equal(crewTarget(30, 10), 40);          // "rolls against 40 instead of 30"
assert.equal(crewTarget(50, 10), 60);
// a target is a percentile, so it cannot leave 0-100
assert.equal(crewTarget(95, 20), 100);
assert.equal(crewTarget(20, -40), 0);
assert.equal(crewTarget(undefined), 0);

/* ---- the signature action maths ----
   Re-exported from voidcombat.js, where the to-hit calculation consumes them.
   Checked here too because these are the names the role table advertises. */

assert.equal(backsIntoIt(0), 0);
assert.equal(backsIntoIt(2), 10, '+5 per Degree of Success');
assert.equal(backsIntoIt(3), 15);
assert.equal(lockBonus(4), 20, '+5 per Degree of Success');

// Evasion is -10 for succeeding AND a further -10 per degree, capped at -50.
// A local copy here once had it as a flat -10 per degree, which made a bare
// success worth nothing and an excellent one worth half what it should be.
assert.equal(evasionPenalty(0), -10);
assert.equal(evasionPenalty(3), -40);
assert.equal(evasionPenalty(9), -50, 'hard cap');

// A failed test is not a buff: negative or junk degrees give nothing rather
// than quietly penalising your own crew.
for (const bad of [-1, -5, null, undefined, 'two', NaN]) {
  assert.equal(backsIntoIt(bad), 0, 'backsIntoIt ' + bad);
  assert.equal(lockBonus(bad), 0, 'lockBonus ' + bad);
  assert.equal(evasionPenalty(bad), -10, 'evasionPenalty ' + bad);
}

/* ---- the GM is orthogonal to the station ---- */

// A GM needs no station at all, which is the normal case for one running NPC
// ships, and can write every field.
for (const f of SHIP_FIELDS) {
  assert.equal(can(null, f, { isGm: true }), true, 'gm: ' + f);
}
assert.equal(can('stowaway', 'morale', { isGm: true }), true);
// even a GM cannot write a field that does not exist
assert.equal(can(null, 'selfDestruct', { isGm: true }), false);

// No station owns the GM-only fields — not even the Lord-Captain's override.
// The Captain commands the ship; they do not author the encounter.
assert.deepEqual(GM_ONLY_FIELDS,
  ['phase', 'enemies', 'corruption', 'repInquisition', 'repMechanicus', 'repNavy', 'repColdTrade']);
for (const f of GM_ONLY_FIELDS) {
  assert.equal(can('lordcaptain', f), false, 'captain must not write ' + f);
  assert.equal(can(null, f, { isGm: true }), true);
}
assert.deepEqual(deniedWrites('lordcaptain', ['morale', 'phase']), ['phase']);
assert.deepEqual(deniedWrites('lordcaptain', ['morale', 'phase'], { isGm: true }), []);

/* ---- events belong to the GM alone ---- */

assert.ok(GM_EVENTS.length >= 10);
for (const e of GM_EVENTS) {
  assert.ok(e.id && e.name && e.note, e.id);
  assert.ok(e.writes.length, e.id + ': writes something');
  for (const f of e.writes) {
    assert.ok(SHIP_FIELDS.includes(f), `${e.id}: unknown field ${f}`);
    // and a GM is permitted every field its own events write
    assert.equal(can(null, f, { isGm: true }), true);
  }
}
assert.equal(eventById('warp_storm').name, 'Warp storm');
assert.equal(eventById('nope'), null);

// the Poisoned Chalice additions: GM-only, like phase/enemies
assert.deepEqual(eventById('corruption_surge').writes, ['corruption']);
for (const id of ['rep_inquisition', 'rep_mechanicus', 'rep_navy', 'rep_coldtrade']) {
  assert.ok(eventById(id), id);
  assert.equal(can('lordcaptain', eventById(id).writes[0]), false, id + ' is GM-only');
}

assert.equal(canTriggerEvent('fire', true), true);
// The Enginseer owns `fires` and still cannot start one: owning the field is
// not authority to author the event that writes it.
assert.equal(canTriggerEvent('fire', false), false);
assert.equal(can('enginseer', 'fires'), true);
assert.equal(canTriggerEvent('nonsense', true), false);
assert.equal(canTriggerEvent('fire', undefined), false);

/* ---- the worked example from the design ---- */

// The Captain's Put Your Backs Into It! at 2 DoS turns a Competent crew's 30
// into 40 for the turn, so a delegated repair rolls against 40.
assert.equal(crewTarget(30, backsIntoIt(2)), 40);

assert.equal(roleById('enginseer').department, 'Enginarium, plasma drive, tech-shrines');
assert.equal(roleById('nope'), null);

console.log('shiproles: all checks passed (%d roles)', SHIP_ROLES.length);

/* ---- every vitals key the app produces must be writable ----
   voidShields was missing from SHIP_FIELDS, so every dice roll in a live
   session published a field the check refused. Nothing caught it because
   nothing compared the two lists. */

{
  const { newVitals } = await import('./ship.js');
  const { actionOutcome, EXTENDED_ACTIONS, applyEvent } = await import('./voidcombat.js');
  const { GM_EVENTS } = await import('./shiproles.js');

  const bp = {
    hullId: 'hull-lunar', dynastySP: 200, crew: 'competent',
    essential: {}, weapons: [], supplemental: []
  };

  // what a fresh ship's vitals contain
  for (const k of Object.keys(newVitals(bp))) {
    assert.ok(SHIP_FIELDS.includes(k), `newVitals writes unknown field: ${k}`);
  }

  // what an attack writes: hull integrity and the shields it spent
  for (const k of ['hullIntegrity', 'voidShields']) {
    assert.ok(SHIP_FIELDS.includes(k), `an attack writes unknown field: ${k}`);
    assert.equal(can(null, k, { isGm: true }), true, `a GM cannot write ${k}`);
  }

  // what every extended action writes
  for (const a of EXTENDED_ACTIONS) {
    const r = actionOutcome(a.id, 1, { vitals: { hullIntegrity: 10, morale: 50 } },
      { targetId: 'e1', maxHull: 60, system: 'ship' });
    for (const k of Object.keys(r.vitals || {})) {
      assert.ok(SHIP_FIELDS.includes(k), `${a.id} writes unknown field: ${k}`);
    }
  }

  // what every GM event writes
  for (const e of GM_EVENTS) {
    const r = applyEvent({ hullIntegrity: 40, morale: 80, population: 90, fires: [] },
      { id: e.id, amount: 3, component: 'life-vitae', enemies: [] });
    for (const k of Object.keys(r.patch || {})) {
      assert.ok(SHIP_FIELDS.includes(k), `event ${e.id} writes unknown field: ${k}`);
      assert.equal(can(null, k, { isGm: true }), true, `a GM cannot write ${k}`);
    }
  }
}

console.log('shiproles: writable-field coverage OK');
