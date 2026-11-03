// Self-check for a weapon-aware WS/BS attack. Run: node src/attackroll.check.mjs
import assert from 'node:assert/strict';
import {
  ATTACK_ACTION_IDS, weaponsFor, actionsFor, actionBonus, roundsLeft, isJammed, attack, damageSpec,
  overheatDamage, reloaded, jamCleared, isReady, nextReady, weaponStatus, catalogueWeapons
} from './attackroll.js';
import { weaponProfile } from './groundcombat.js';

const W = (label) => weaponProfile(label);

/* ---- which weapons a sheet offers for which skill ---- */
{
  const gear = ['Lasgun', 'Chainsword', 'Flak Armour', 'Good Lasgun', 'Plasma Pistol', 'Lasgun', 'Medicae kit', 42, null];
  const bs = weaponsFor(gear, 'bs').map((w) => w.label);
  assert.deepEqual(bs, ['Lasgun', 'Good Lasgun', 'Plasma Pistol'], 'guns, once each, armour and junk left out');
  assert.deepEqual(weaponsFor(gear, 'ws').map((w) => w.label), ['Chainsword']);
  assert.deepEqual(weaponsFor(['Flak Armour'], 'bs'), []);
  assert.deepEqual(weaponsFor(null, 'bs'), []);
  assert.deepEqual(weaponsFor(gear, 'nonsense'), []);
  for (const w of weaponsFor(gear, 'bs')) assert.ok(w.damage, `${w.label} has a damage line to roll`);
}

/* ---- the fire modes a weapon allows ---- */
{
  const ids = (label) => actionsFor(W(label)).map((a) => a.id);
  assert.deepEqual(ids('Lasgun'), ['standard_attack', 'semi_auto_burst'], 'no full auto on a lasgun');
  assert.deepEqual(ids('Boltgun'), ['standard_attack', 'semi_auto_burst', 'full_auto_burst']);
  assert.deepEqual(ids('Stub Revolver'), ['standard_attack'], 'a revolver is single shot only');
  assert.deepEqual(ids('Heavy Bolter'), ['full_auto_burst'], 'a heavy bolter has no single shot');
  assert.deepEqual(ids('Chainsword'), ATTACK_ACTION_IDS.ws, 'melee stances');
  assert.deepEqual(actionsFor(null), []);
  assert.equal(actionBonus({ toHitMod: 10 }, 'bs'), 10);
  assert.equal(actionBonus({ wsMod: 20 }, 'ws'), 20);
  assert.equal(actionBonus({ wsMod: 20 }, 'bs'), 0, 'a melee stance does nothing to a shot');
  assert.equal(actionBonus({ toHitMod: 10 }, 'ws'), 0);
  assert.equal(actionBonus(null, 'bs'), 0);
}

/* ---- rounds ---- */
{
  const las = W('Lasgun');
  assert.equal(roundsLeft(null, las), las.clip, 'a fresh weapon is full');
  assert.equal(roundsLeft({ rounds: 7 }, las), 7);
  assert.equal(roundsLeft({ rounds: 0 }, las), 0, 'empty is not "no record"');
  assert.equal(roundsLeft({ rounds: -3 }, las), 0);
  assert.equal(roundsLeft({}, W('Chainsword')), null, 'a blade has no clip');
  assert.equal(isJammed({ jammed: true }), true);
  assert.equal(isJammed(null), false);
}

/* ---- the attack ---- */
{
  const las = W('Lasgun');            // clip 60, semi-auto 3, Reliable
  // a hit: the roll is made at skill plus modifier, a round is spent, the hit is scored
  let r = attack({ weapon: las, base: 40, modifier: 10, roll: 30, d10: 1 });
  assert.equal(r.blocked, null);
  assert.equal(r.target, 50);
  assert.equal(r.success, true);
  assert.equal(r.degrees, 2);
  assert.equal(r.hits, 1);
  assert.equal(r.cost, 1);
  assert.equal(r.rounds, 59);
  assert.deepEqual(r.patch, { rounds: 59 });
  assert.equal(r.jammed, false);

  // a miss still spends the round
  r = attack({ weapon: las, base: 40, roll: 70, d10: 1 });
  assert.equal(r.success, false);
  assert.equal(r.hits, 0);
  assert.deepEqual(r.patch, { rounds: 59 });

  // a burst: easier to land, costs its rate, scores a hit per two degrees, capped at the rate
  r = attack({ weapon: las, base: 40, actionId: 'semi_auto_burst', roll: 10, d10: 1 });
  assert.equal(r.target, 50, 'a burst is +10');
  assert.equal(r.cost, 3);
  assert.equal(r.rounds, 57);
  assert.equal(r.hits, 3, '1 + 4 degrees of success / 2, up to the three the mode allows');
  r = attack({ weapon: W('Boltgun'), base: 50, actionId: 'full_auto_burst', roll: 20, d10: 1 });
  assert.equal(r.target, 70, 'full auto is +20');
  assert.equal(r.cost, 4);
  assert.equal(r.hits, 4, '1 + 5 degrees, capped at the weapon’s full-auto rate');

  // not enough rounds: nothing is rolled and nothing is spent
  r = attack({ weapon: las, state: { rounds: 2 }, base: 40, actionId: 'semi_auto_burst', roll: 10 });
  assert.equal(r.blocked, 'empty');
  assert.match(r.reason, /Lasgun has 2 rounds; that needs 3\. Reload\./);
  assert.equal(r.patch, undefined);
  assert.equal(attack({ weapon: las, state: { rounds: 0 }, base: 40, roll: 10 }).blocked, 'empty');
  assert.match(attack({ weapon: las, state: { rounds: 1 }, base: 40, actionId: 'semi_auto_burst', roll: 10 }).reason, /has 1 round;/);
  assert.equal(attack({ weapon: las, state: { rounds: 1 }, base: 40, roll: 10 }).blocked, null, 'the last round can be fired');

  // jammed: it will not fire at all until cleared
  r = attack({ weapon: las, state: { jammed: true, rounds: 50 }, base: 40, roll: 10 });
  assert.equal(r.blocked, 'jammed');
  assert.match(r.reason, /Lasgun is jammed/);

  // 96+ jams a gun and is a miss however good the target; the round is spent and the jam recorded
  const stub = W('Stub Revolver');    // Reliable too: use a plain gun for the plain rule
  const plain = W('Autogun');         // clip 30, no qualities
  r = attack({ weapon: plain, base: 90, roll: 96 });
  assert.equal(r.jammed, true);
  assert.equal(r.success, false, 'a jam is an automatic miss');
  assert.equal(r.hits, 0);
  assert.deepEqual(r.patch, { rounds: 29, jammed: true });
  assert.equal(attack({ weapon: plain, base: 90, roll: 95 }).jammed, false);
  assert.equal(attack({ weapon: plain, base: 99, roll: 95 }).success, true, '95 is not a jam, and under 99 it hits');
  // 94+ on a burst
  assert.equal(attack({ weapon: plain, base: 90, actionId: 'semi_auto_burst', roll: 94 }).jammed, true);
  assert.equal(attack({ weapon: plain, base: 90, actionId: 'semi_auto_burst', roll: 93 }).jammed, false);

  // Reliable: only a 10 on the confirmation die is a real jam
  r = attack({ weapon: las, base: 40, roll: 97, d10: 4 });
  assert.equal(r.jammed, false);
  assert.equal(r.jam.reliableSaved, true);
  assert.equal(r.success, false, 'saved from the jam, still a miss');
  assert.deepEqual(r.patch, { rounds: 59 });
  assert.equal(attack({ weapon: las, base: 40, roll: 97, d10: 10 }).jammed, true);
  assert.equal(stub.qualities.includes('Reliable'), true);

  // craftsmanship, from the label: Good is Reliable, Poor Unreliable, Best never jams
  const good = W('Good Autogun'), poor = W('Poor Autogun'), best = W('Best Autogun');
  assert.equal(attack({ weapon: good, base: 90, roll: 97, d10: 4 }).jammed, false, 'a good gun is Reliable');
  assert.equal(attack({ weapon: poor, base: 90, roll: 91 }).jammed, true, 'a poor gun jams on 91');
  assert.equal(attack({ weapon: plain, base: 90, roll: 91 }).jammed, false, 'a common one does not');
  r = attack({ weapon: best, base: 90, roll: 99, d10: 10 });
  assert.equal(r.jammed, false, 'the best never jams');

  // a thrown weapon never jams
  assert.equal(attack({ weapon: { ...plain, kind: 'Thrown' }, base: 90, roll: 99 }).jammed, false);

  // melee: no clip, no jam, no rounds to spend, but a stance changes the roll
  const sword = W('Chainsword');
  r = attack({ weapon: sword, base: 40, roll: 99 });
  assert.equal(r.jammed, false);
  assert.deepEqual(r.patch, {}, 'nothing to write back');
  assert.equal(r.rounds, null);
  assert.equal(attack({ weapon: sword, base: 40, actionId: 'all_out_attack', roll: 50 }).target, 60);
  assert.equal(attack({ weapon: sword, base: 40, actionId: 'guarded_attack', roll: 50 }).target, 30);
  assert.equal(attack({ weapon: sword, base: 40, actionId: 'charge', roll: 50 }).target, 50);
  assert.equal(attack({ weapon: sword, base: 40, actionId: 'standard_attack', roll: 50 }).hits, 0, 'a 50 against 40 misses');
  assert.equal(attack({ weapon: sword, base: 40, actionId: 'all_out_attack', roll: 40 }).hits, 1, 'and one hit when it lands');

  // overheating: 91+ on a plasma weapon, which still shoots
  const plasma = W('Plasma Gun');
  r = attack({ weapon: plasma, base: 60, roll: 92 });
  assert.equal(r.overheated, true);
  assert.equal(r.jammed, false, 'an overheat is not a jam');
  assert.equal(r.overheat.pen, 0);
  assert.equal(r.overheat.location, 'arm');
  assert.equal(r.overheat.avoidableByDropping, true);
  assert.equal(attack({ weapon: plasma, base: 60, roll: 90 }).overheated, false);
  // it overheats whether or not the shot hit: 91 against a skill of 95 is a hit that also overheats
  r = attack({ weapon: plasma, base: 95, roll: 91 });
  assert.equal(r.overheated, true);
  assert.equal(r.success, true, 'the shot still lands');
  assert.equal(r.hits, 1);
  assert.equal(attack({ weapon: plasma, base: 60, roll: 55 }).overheat, null);

  // the automatic results are carried through
  assert.equal(attack({ weapon: las, base: 5, roll: 4 }).success, true, '01-05 always hits');
  assert.equal(attack({ weapon: las, base: 5, roll: 4 }).automatic, true);

  // nothing in, nothing out
  assert.equal(attack({}).blocked, 'none');
  assert.equal(attack().blocked, 'none');
}

/* ---- what a hit rolls ---- */
{
  let spec = damageSpec(W('Lasgun'), 4);
  assert.deepEqual(spec, { dice: 1, die: 10, bonus: 3, strengthBonus: 0, type: 'energy', pen: 0 }, 'a gun’s line is complete');
  spec = damageSpec(W('Chainsword'), 4);
  assert.deepEqual(spec, { dice: 1, die: 10, bonus: 6, strengthBonus: 4, type: 'rending', pen: 2 }, 'a blade adds the wielder’s Strength Bonus');
  assert.equal(damageSpec(W('Boltgun'), 9).bonus, 5, 'a gun ignores Strength Bonus');
  assert.equal(damageSpec(W('Boltgun')).type, 'explosive');
  assert.equal(damageSpec(W('Pulse Rifle')).dice, 2);
  assert.equal(damageSpec(W('Chainsword'), -3).bonus, 2, 'a negative Strength Bonus is no bonus');
  assert.equal(damageSpec(W('Chainsword'), 'x').bonus, 2);
  assert.equal(damageSpec(null), null);
  assert.equal(damageSpec({ skillType: 'bs' }), null);
}

/* ---- overheat damage, reload and a cleared jam ---- */
{
  const plasma = W('Plasma Gun');          // 1d10+6 E
  const seq = [7];
  assert.deepEqual(overheatDamage(plasma, () => seq[0]), { dice: [7], total: 13 });
  assert.equal(overheatDamage(W('Pulse Rifle'), () => 3).total, 3 + 3 + 3, '2d10+3');
  assert.equal(overheatDamage(null), null);
  assert.deepEqual(reloaded(W('Lasgun')), { rounds: 60 });
  assert.deepEqual(reloaded(W('Chainsword')), {});
  assert.deepEqual(jamCleared(W('Lasgun')), { jammed: false, rounds: 0 }, 'a cleared jam leaves it empty');
  assert.deepEqual(jamCleared(W('Chainsword')), { jammed: false });
  // the round trip: jam it, clear it, reload it, fire it again
  let state = {};
  let r = attack({ weapon: W('Autogun'), state, base: 90, roll: 98 });
  state = { ...state, ...r.patch };
  assert.equal(attack({ weapon: W('Autogun'), state, base: 90, roll: 10 }).blocked, 'jammed');
  state = { ...state, ...jamCleared(W('Autogun')) };
  assert.equal(attack({ weapon: W('Autogun'), state, base: 90, roll: 10 }).blocked, 'empty');
  state = { ...state, ...reloaded(W('Autogun')) };
  r = attack({ weapon: W('Autogun'), state, base: 90, roll: 10 });
  assert.equal(r.blocked, null);
  assert.equal(r.rounds, 29);
}

/* ---- several weapons: which is ready, what each chip says, what to reach for next ---- */
{
  const guns = ['Good Pulse Rifle', 'Good Pulse Carbine', 'Best Pulse Pistol'].map(W);
  const [rifle, carbine, pistol] = guns;
  assert.equal(isReady(rifle, null), true, 'a fresh gun is ready');
  assert.equal(isReady(rifle, { jammed: true }), false);
  assert.equal(isReady(rifle, { rounds: 0 }), false, 'an empty gun is not ready');
  assert.equal(isReady(rifle, { rounds: 1 }), true);
  assert.equal(isReady(W('Chainsword'), null), true, 'a blade has no clip to run dry');
  assert.equal(isReady(null, null), false);

  assert.equal(weaponStatus(rifle, null), `${rifle.clip}/${rifle.clip}`);
  assert.equal(weaponStatus(rifle, { rounds: 12 }), `12/${rifle.clip}`);
  assert.equal(weaponStatus(rifle, { rounds: 0 }), 'EMPTY');
  assert.equal(weaponStatus(rifle, { jammed: true, rounds: 20 }), 'JAMMED', 'a jam outranks the count');
  assert.equal(weaponStatus(W('Chainsword'), null), '');

  const states = { [rifle.label]: { jammed: true } };
  assert.equal(nextReady(guns, states).label, carbine.label, 'the jammed rifle is skipped');
  assert.equal(nextReady(guns, states, carbine.label).label, pistol.label, 'and so is the one just tried');
  assert.equal(nextReady(guns, { ...states, [carbine.label]: { rounds: 0 }, [pistol.label]: { jammed: true } }), null, 'nothing ready is null');
  assert.equal(nextReady([], {}), null);
  assert.equal(nextReady(guns, null).label, rifle.label, 'no state at all: the first');
}

/* ---- the catalogue, for adding a weapon the character carries ---- */
{
  const bs = catalogueWeapons('bs');
  const ws = catalogueWeapons('ws');
  assert.ok(bs.length > 20 && ws.length > 5, `plenty of each: ${bs.length} ranged, ${ws.length} melee`);
  assert.ok(bs.some((w) => w.label === 'Laspistol') && ws.some((w) => w.label === 'Chainsword'));
  assert.ok(!bs.some((w) => w.label === 'Chainsword') && !ws.some((w) => w.label === 'Laspistol'), 'by skill');
  assert.ok(bs.every((w) => weaponProfile(w.label) && weaponProfile(w.label).damage), 'every one parses, with a damage line');
  assert.equal(new Set(bs.map((w) => w.label)).size, bs.length, 'none twice');
  const kinds = bs.map((w) => w.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => a.localeCompare(b)), 'grouped by kind');
  // a character can be handed one and it is then offered
  assert.equal(weaponsFor(['Laspistol'], 'bs').length, 1);
}

console.log('attackroll: all checks passed');
