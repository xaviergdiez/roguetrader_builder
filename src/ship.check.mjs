// Self-check for the voidship constraint engine. Run: node src/ship.check.mjs
import assert from 'node:assert/strict';
import {
  HULLS, COMPONENTS, ESSENTIAL_CATEGORIES, CREW_RATINGS,
  SLOT_NAMES, WEAPON_CLASSES,
  allHulls, allComponents, isHomebrew,
  validateHull, validateComponent, validateCustom, usableCustom, damageText,
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

/* ============================== HOMEBREW ============================== */

const goodHull = {
  id: 'hull-maekao', name: 'Ma\u2019Kao Pattern', cls: 'Light Cruiser',
  speed: 7, manoeuvre: 18, detection: 22, armour: 18, hullIntegrity: 58,
  turrets: 2, space: 62, sp: 52, slots: ['prow', 'port', 'starboard']
};

const goodGun = {
  id: 'weap-maekao-battery', name: 'Ma\u2019Kao Battery', category: 'weapon',
  power: -5, space: 3, sp: 2,
  weaponClass: 'macro', str: 4, damageDice: 1, damageBonus: 3, crit: 4, range: 8
};

/* ---- a valid definition passes ---- */

assert.deepEqual(validateHull(goodHull), []);
assert.deepEqual(validateComponent(goodGun), []);
assert.deepEqual(validateCustom({ hulls: [goodHull], components: [goodGun] }), []);

/* ---- and is then resolvable and usable ---- */

{
  const custom = { hulls: [goodHull], components: [goodGun] };
  assert.equal(allHulls(custom).length, HULLS.length + 1);
  assert.equal(allComponents(custom).length, COMPONENTS.length + 1);
  assert.equal(hullById('hull-maekao', custom).name, 'Ma\u2019Kao Pattern');
  assert.equal(componentById('weap-maekao-battery', custom).str, 4);
  // ...and invisible without the catalogue, so a built-in lookup is unchanged
  assert.equal(hullById('hull-maekao'), null);
  assert.equal(componentById('weap-maekao-battery'), null);
  assert.equal(hullById('hull-lunar', custom).name, 'Lunar-class', 'built-ins still resolve');

  assert.equal(isHomebrew('hull-maekao'), true);
  assert.equal(isHomebrew('hull-lunar'), false);
  assert.equal(isHomebrew('weap-macrocannon-mars'), false);
}

/* ---- a blueprint carries its own definitions, so it validates alone ---- */

{
  const bp = {
    hullId: 'hull-maekao',
    dynastySP: 80,
    crew: 'competent',
    custom: { hulls: [goodHull], components: [goodGun] },
    essential: {
      plasmaDrive: 'drive-jovian3', warpEngine: 'warp-strelov1',
      gellerField: 'geller-basic', voidShield: 'shield-single',
      bridge: 'bridge-combat', lifeSustainer: 'life-vitae',
      crewQuarters: 'quarters-voidsmen', augurArray: 'augur-m100'
    },
    weapons: [{ slot: 'prow', componentId: 'weap-maekao-battery' }],
    supplemental: []
  };

  const v = validate(bp);
  assert.deepEqual(v.errors, [], 'a homebrew blueprint is legal on its own');
  // 25 essential draw + 5 for the homebrew gun
  assert.equal(v.budget.usedPower, 30);
  assert.equal(v.budget.totalPower, 60);
  // 29 essential space (12+10+0+1+1+2+3+0) + 3 for the gun
  assert.equal(v.budget.usedSpace, 32);
  assert.equal(v.budget.totalSpace, 62, 'the homebrew hull\u2019s Space is used');
  // hull 52 + gun 2
  assert.equal(v.budget.spentSP, 54);

  // the homebrew hull drives the derived stats
  const st = stats(bp);
  assert.equal(st.speed, 7);
  assert.equal(st.armour, 18);
  assert.equal(st.hullIntegrity, 58);
  assert.equal(st.turrets, 2);
  assert.equal(newVitals(bp).hullIntegrity, 58);

  // and its mounts are enforced like any other hull's
  const bad = validate({ ...bp,
    weapons: [{ slot: 'dorsal', componentId: 'weap-maekao-battery' }] });
  assert.ok(bad.errors.some((e) => /no dorsal mount/.test(e)), bad.errors.join('; '));

  // Without its definitions the same blueprint is not silently half-valid:
  // the hull is simply missing.
  const orphaned = validate({ ...bp, custom: null });
  assert.equal(orphaned.ok, false);
  assert.deepEqual(orphaned.errors, ['No hull chosen.']);
}

/* ---- broken definitions are refused, with a reason ---- */

const hullErr = (patch) => validateHull({ ...goodHull, ...patch });

assert.ok(hullErr({ id: '' }).some((m) => /needs an id/.test(m)));
assert.ok(hullErr({ name: '  ' }).some((m) => /needs a name/.test(m)));
// The class string sets the target-size modifier, so a blank one would make a
// battleship as easy to hit as a frigate.
assert.ok(hullErr({ cls: '' }).some((m) => /target size/.test(m)));
assert.ok(hullErr({ armour: 0 }).some((m) => /Armour/.test(m)));
assert.ok(hullErr({ armour: 'thick' }).some((m) => /Armour/.test(m)));
assert.ok(hullErr({ hullIntegrity: -5 }).some((m) => /Hull Integrity/.test(m)));
assert.ok(hullErr({ space: 0 }).some((m) => /Space/.test(m)));
assert.ok(hullErr({ sp: 0 }).some((m) => /Ship Points/.test(m)));
assert.ok(hullErr({ turrets: -1 }).some((m) => /Turret/.test(m)));
assert.ok(hullErr({ speed: 1.5 }).some((m) => /Speed/.test(m)));
assert.ok(hullErr({ slots: [] }).some((m) => /at least one weapon mount/.test(m)));
assert.ok(hullErr({ slots: ['keel'] }).some((m) => /Unknown mount/.test(m)));
// manoeuvre may be negative — a transport is sluggish
assert.deepEqual(hullErr({ manoeuvre: -10 }), []);

// Shadowing a built-in is refused: a sheet would read "Lunar-class" and carry
// someone else's numbers.
assert.ok(hullErr({ id: 'hull-lunar' }).some((m) => /already a built-in/.test(m)));

const compErr = (patch) => validateComponent({ ...goodGun, ...patch });

assert.ok(compErr({ category: 'nonsense' }).some((m) => /Category must be/.test(m)));
assert.ok(compErr({ id: 'weap-macrocannon-mars' }).some((m) => /already a built-in/.test(m)));
assert.ok(compErr({ space: -1 }).some((m) => /Space/.test(m)));
// Only a plasma drive generates power.
assert.ok(compErr({ power: 5 }).some((m) => /Only a plasma drive/.test(m)));
assert.deepEqual(validateComponent({
  id: 'drive-custom', name: 'Custom Drive', category: 'plasmaDrive',
  power: 70, space: 14, sp: 0
}), []);
assert.ok(validateComponent({
  id: 'drive-dud', name: 'Dud', category: 'plasmaDrive', power: -5, space: 1, sp: 0
}).some((m) => /must generate power/.test(m)));

// Weapon-only rules
assert.ok(compErr({ weaponClass: 'plasma' }).some((m) => /needs a class/.test(m)));
assert.ok(compErr({ str: 0 }).some((m) => /Strength/.test(m)));
// Range zero reads as "out of range" everywhere, so it could never fire.
assert.ok(compErr({ range: 0 }).some((m) => /never fire/.test(m)));
assert.ok(compErr({ crit: 0 }).some((m) => /Crit/.test(m)));
// ...and none of those apply to a supplemental
assert.deepEqual(validateComponent({
  id: 'comp-shrine', name: 'Shrine of the Emperor Ascendant',
  category: 'supplemental', power: -1, space: 2, sp: 1
}), []);

assert.deepEqual(WEAPON_CLASSES, ['macro', 'lance', 'torpedo']);
assert.deepEqual(SLOT_NAMES, ['prow', 'dorsal', 'port', 'starboard']);

/* ---- a duplicate id inside the catalogue is caught ---- */

{
  const dupes = validateCustom({
    hulls: [goodHull, { ...goodHull, name: 'Other' }],
    components: []
  });
  assert.ok(dupes.some((d) => d.msg === 'Duplicate id.'), JSON.stringify(dupes));

  // a component cannot reuse a hull's id either
  const across = validateCustom({
    hulls: [goodHull],
    components: [{ ...goodGun, id: 'hull-maekao' }]
  });
  assert.ok(across.some((d) => d.msg === 'Duplicate id.'));
}

/* ---- one broken entry does not take the rest with it ---- */

{
  const mixed = {
    hulls: [goodHull, { id: 'hull-broken', name: 'Broken' }],
    components: [goodGun, { id: 'comp-broken' }]
  };
  assert.ok(validateCustom(mixed).length > 0);

  const usable = usableCustom(mixed);
  assert.deepEqual(usable.hulls.map((h) => h.id), ['hull-maekao']);
  assert.deepEqual(usable.components.map((c) => c.id), ['weap-maekao-battery']);
}

/* ---- absent, empty and malformed catalogues are all just "no homebrew" ---- */

assert.deepEqual(validateCustom(null), []);
assert.deepEqual(validateCustom({}), []);
assert.deepEqual(validateCustom({ hulls: 'nope', components: 7 }), []);
assert.equal(allHulls(null).length, HULLS.length);
assert.equal(allHulls({ hulls: null }).length, HULLS.length);
assert.equal(allComponents(undefined).length, COMPONENTS.length);
assert.deepEqual(usableCustom(null), { hulls: [], components: [] });

console.log('ship: homebrew checks passed');

/* ---- the damage string is derived when a homebrew weapon has none ---- */

assert.equal(damageText(componentById('weap-macrocannon-mars')), '1d10+2',
  'a built-in keeps its own string');
assert.equal(damageText({ damageDice: 1, damageBonus: 3 }), '1d10+3');
assert.equal(damageText({ damageDice: 2, damageBonus: 0 }), '2d10');
assert.equal(damageText({ damageDice: 1, damageBonus: -1 }), '1d10-1');
assert.equal(damageText({ damageBonus: 4 }), '+4', 'no dice, just a bonus');
assert.equal(damageText({}), '');
assert.equal(damageText(null), '');

console.log('ship: damage text OK');
