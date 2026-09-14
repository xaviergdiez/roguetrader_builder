// Self-check for the voidship constraint engine. Run: node src/ship.check.mjs
import assert from 'node:assert/strict';
import {
  HULLS, COMPONENTS, ESSENTIAL_CATEGORIES, CREW_RATINGS,
  hullById, componentById, crewRating,
  powerGenerated, powerUsed, spaceUsed, spSpent, budget, validate,
  stats, newVitals, POP_PENALTY_THRESHOLD
} from './ship.js';

/* ---- the data is well formed ---- */

assert.equal(HULLS.length, 7);
for (const h of HULLS) {
  assert.ok(h.id && h.name && h.cls, h.id + ': identity');
  assert.ok(h.space > 0 && h.sp > 0, h.id + ': space and sp');
  assert.ok(h.hullIntegrity > 0 && h.armour > 0, h.id + ': vitals');
  assert.ok(Array.isArray(h.slots) && h.slots.length, h.id + ': slots');
  for (const s of h.slots) {
    assert.ok(['prow', 'dorsal', 'port', 'starboard'].includes(s), h.id + ': slot ' + s);
  }
}
// a Sword-class carries two dorsal mounts, so the slot list repeats
assert.deepEqual(hullById('hull-sword').slots, ['dorsal', 'dorsal']);
assert.equal(hullById('hull-lunar').slots.filter((s) => s === 'port').length, 2);
assert.equal(hullById('nope'), null);

for (const c of COMPONENTS) {
  assert.ok(c.id && c.name, c.id + ': identity');
  assert.ok(Number.isInteger(c.power), c.id + ': power');
  assert.ok(Number.isInteger(c.space) && c.space >= 0, c.id + ': space');
  assert.ok(Number.isInteger(c.sp) && c.sp >= 0, c.id + ': sp');
}
// only a plasma drive generates power; everything else draws it
for (const c of COMPONENTS) {
  if (c.power > 0) assert.equal(c.category, 'plasmaDrive', c.id + ' generates power');
}
assert.equal(componentById('weap-macrocannon-mars').weaponClass, 'macro');

/* ---- crew ratings ---- */

assert.deepEqual(CREW_RATINGS.map((c) => c.rating), [20, 30, 40, 50]);
assert.equal(crewRating('crack').rating, 40);
assert.equal(crewRating('crack').sp, 5);
assert.equal(crewRating('veteran').sp, 15);
// an unknown rating falls back to Competent, the standard starting crew
assert.equal(crewRating(undefined).id, 'competent');
assert.equal(crewRating('nonsense').rating, 30);

/* ---- a legal blueprint ---- */

const essential = {
  plasmaDrive: 'drive-jovian3',
  warpEngine: 'warp-strelov1',
  gellerField: 'geller-basic',
  voidShield: 'shield-single',
  bridge: 'bridge-combat',
  lifeSustainer: 'life-vitae',
  crewQuarters: 'quarters-voidsmen',
  augurArray: 'augur-m100'
};

const dauntless = {
  hullId: 'hull-dauntless',
  dynastySP: 60,
  crew: 'competent',
  essential,
  weapons: [
    { slot: 'port', componentId: 'weap-macrocannon-mars' },
    { slot: 'starboard', componentId: 'weap-macrocannon-mars' }
  ],
  supplemental: ['comp-munitorum']
};

{
  const v = validate(dauntless);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);

  const b = v.budget;
  assert.equal(b.totalPower, 60);                 // the Class III drive alone
  // 10+1+5+1+4+1+3 essential draw, 4+4 weapons, 2 munitorum
  assert.equal(b.usedPower, 35);
  assert.equal(b.powerRemaining, 25);
  // 12+10+0+1+1+2+3+0 essential, 2+2 weapons, 3 munitorum
  assert.equal(b.usedSpace, 36);
  assert.equal(b.totalSpace, 60);
  assert.equal(b.spaceRemaining, 24);
  // hull 55, crew 0, weapons 1+1, munitorum 2
  assert.equal(b.spentSP, 59);
  assert.equal(b.spRemaining, 1);
}

/* ---- each constraint is enforced ---- */

// SP: upgrading the crew to Veteran costs 15 and the budget has 1 left
{
  const v = validate({ ...dauntless, crew: 'veteran' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /Ship Points are over by 14/.test(e)), v.errors.join('; '));
}

// Power: an escort drive still carries the Dauntless fit above — 45 generated
// against 35 drawn — so overdrawing takes a cruiser's worth of guns. Three
// lances and every supplemental on an escort drive is 48 against 45.
{
  const v = validate({
    hullId: 'hull-lunar',
    dynastySP: 200,                          // isolate power from the SP check
    crew: 'competent',
    essential: { ...essential, plasmaDrive: 'drive-jovian2' },
    weapons: [
      { slot: 'prow', componentId: 'weap-lance-starbreaker' },
      { slot: 'port', componentId: 'weap-lance-starbreaker' },
      { slot: 'starboard', componentId: 'weap-lance-starbreaker' }
    ],
    supplemental: ['comp-munitorum', 'comp-tenebro-maze',
      'comp-smugglers-hold', 'comp-flak-turrets']
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /Power is over by 3/.test(e)), v.errors.join('; '));
  // and nothing else is wrong with it
  assert.equal(v.errors.length, 1, v.errors.join('; '));
}

// The same fit on the cruiser-weight drive is legal.
{
  const v = validate({
    hullId: 'hull-lunar',
    dynastySP: 200,
    crew: 'competent',
    essential,
    weapons: [
      { slot: 'prow', componentId: 'weap-lance-starbreaker' },
      { slot: 'port', componentId: 'weap-lance-starbreaker' },
      { slot: 'starboard', componentId: 'weap-lance-starbreaker' }
    ],
    supplemental: ['comp-munitorum', 'comp-tenebro-maze',
      'comp-smugglers-hold', 'comp-flak-turrets']
  });
  assert.deepEqual(v.errors, []);
  // 60 generated, 48 drawn: 25 essential + 18 lances + 5 supplemental
  assert.equal(v.budget.usedPower, 48);
  assert.equal(v.budget.powerRemaining, 12);
}

// Space: a Hazeroth has 35 Space and this fit needs 36
{
  const v = validate({ ...dauntless, hullId: 'hull-hazeroth', dynastySP: 200 });
  assert.ok(v.errors.some((e) => /Space is over by 1/.test(e)), v.errors.join('; '));
}

/* ---- mounts are capacity, not budget ---- */

// A Sword-class has two dorsal mounts and no port mount at all. Assigning a
// port weapon is unmountable rather than merely expensive.
{
  const v = validate({
    hullId: 'hull-sword', dynastySP: 200, crew: 'competent', essential,
    weapons: [{ slot: 'port', componentId: 'weap-macrocannon-mars' }],
    supplemental: []
  });
  assert.ok(v.errors.some((e) => /no port mount/.test(e)), v.errors.join('; '));
}

// Two dorsal weapons fit; three do not.
{
  const three = ['dorsal', 'dorsal', 'dorsal']
    .map((slot) => ({ slot, componentId: 'weap-macrocannon-mars' }));
  const v = validate({
    hullId: 'hull-sword', dynastySP: 200, crew: 'competent', essential,
    weapons: three, supplemental: []
  });
  assert.ok(v.errors.some((e) => /2 dorsal mount\(s\); 3 weapons/.test(e)),
    v.errors.join('; '));

  const ok = validate({
    hullId: 'hull-sword', dynastySP: 200, crew: 'competent', essential,
    weapons: three.slice(0, 2), supplemental: []
  });
  assert.deepEqual(ok.errors, []);
}

/* ---- the essential eight ---- */

{
  const { gellerField, ...short } = essential;
  const v = validate({ ...dauntless, essential: short });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /gellerField/.test(e)), v.errors.join('; '));
}

// A component in the wrong category passes every sum while leaving the ship
// without the thing that category exists for.
{
  const v = validate({
    ...dauntless,
    essential: { ...essential, gellerField: 'comp-flak-turrets' }
  });
  assert.ok(v.errors.some((e) => /Flak Turrets is not a gellerField/.test(e)),
    v.errors.join('; '));
}

// A non-weapon cannot be mounted in a weapon slot.
{
  const v = validate({
    ...dauntless,
    weapons: [{ slot: 'prow', componentId: 'comp-munitorum' }]
  });
  assert.ok(v.errors.some((e) => /Munitorum is not a weapon/.test(e)), v.errors.join('; '));
}

assert.equal(ESSENTIAL_CATEGORIES.length, 8);
assert.equal(validate({}).ok, false);
assert.deepEqual(validate({}).errors, ['No hull chosen.']);

/* ---- derived stats ---- */

{
  const s = stats(dauntless);
  assert.equal(s.speed, 7);
  assert.equal(s.manoeuvre, 15);
  assert.equal(s.detection, 20);
  assert.equal(s.armour, 19);
  assert.equal(s.turrets, 1);
  assert.equal(s.voidShields, 1);
  // the Life Sustainer and the Voidsmen Quarters each reduce Morale loss by 1
  assert.equal(s.moraleLossReduction, 2);
  assert.equal(s.understaffed, false);

  // Flak Turrets are +1 Turret Rating
  const flak = stats({ ...dauntless, supplemental: ['comp-flak-turrets'] });
  assert.equal(flak.turrets, 2);

  assert.equal(stats({ hullId: 'nope' }), null);
}

// Population below three quarters costs Manoeuvre.
{
  assert.equal(POP_PENALTY_THRESHOLD, 0.75);
  assert.equal(stats(dauntless, { population: 100 }).manoeuvre, 15);
  assert.equal(stats(dauntless, { population: 75 }).manoeuvre, 15, 'exactly 75% is not short');
  assert.equal(stats(dauntless, { population: 74 }).manoeuvre, 10);
  assert.equal(stats(dauntless, { population: 74 }).understaffed, true);
}

/* ---- starting vitals ---- */

{
  const v = newVitals(dauntless);
  assert.equal(v.population, 100);
  assert.equal(v.morale, 100);
  assert.equal(v.hullIntegrity, 60, 'the Dauntless hull integrity');
}

/* ---- the sums ignore what is not installed ---- */

assert.equal(powerGenerated({}), 0);
assert.equal(powerUsed({}), 0);
assert.equal(spaceUsed({}), 0);
assert.equal(spSpent({}), 0);
assert.equal(budget({}).spRemaining, 0);
// an unknown component id is skipped rather than counted as zero-cost junk
assert.equal(spaceUsed({ supplemental: ['comp-does-not-exist'] }), 0);

console.log('ship: all checks passed (%d hulls, %d components)',
  HULLS.length, COMPONENTS.length);
