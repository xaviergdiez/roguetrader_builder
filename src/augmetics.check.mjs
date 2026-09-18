// Self-check for augmetics and power armour. Run: node src/augmetics.check.mjs
import assert from 'node:assert/strict';
import {
  AUGMETICS, augmeticById, gradeOf, labelFor, readLabel, conditionalsOf,
  conditionalsFor, isFreeFor, freeFor, freeUsedIn, costOf, STARTING_MAX,
  AUGMETIC_GEAR, acquisitionFor, ratingFor, hasRequisition
} from './augmetics.js';
import { AVAILABILITY, availabilityMod, STANDING } from './acquisition.js';
import { gearInfo, GEAR } from './gear.js';

/* ---- the catalogue ---- */

assert.equal(AUGMETICS.length, 14);
assert.equal(AUGMETICS.filter((a) => a.kind === 'Power Armour').length, 4);

for (const a of AUGMETICS) {
  assert.ok(a.id && a.name && a.stats && a.desc && a.access, a.id + ' is incomplete');
  assert.ok(a.grades.length >= 1, a.id + ' has no grades');
  assert.ok(Array.isArray(a.careers) && Array.isArray(a.origins), a.id);
  for (const g of a.grades) {
    assert.ok(g.grade && g.effect, a.id + '/' + g.grade + ' is incomplete');
    assert.ok(Number.isFinite(g.xp) && g.xp > 0, a.id + '/' + g.grade + ' has no XP price');
    assert.ok(g.gelt === null || Number.isFinite(g.gelt), a.id + '/' + g.grade + ' gelt');
  }
  // Anything priceless says why, rather than showing a blank where a number goes.
  if (a.grades.every((g) => g.gelt === null)) {
    assert.ok(a.geltNote, a.id + ' has no price and no note explaining it');
  }
}

// The figures as given, spot-checked across both halves of the table.
assert.deepEqual(gradeOf('bionic-arm', 'Good'),
  { grade: 'Good', gelt: 1500, xp: 200, effect: gradeOf('bionic-arm', 'Good').effect });
assert.equal(gradeOf('bionic-leg', 'Common').gelt, 400);
assert.equal(gradeOf('cortex-implant', 'Good').gelt, 7500);
assert.equal(gradeOf('cortex-implant', 'Good').xp, 400);
assert.equal(gradeOf('miu', 'Common').gelt, 2500);
assert.equal(gradeOf('sub-dermal-armour', 'Good').xp, 300);
assert.equal(gradeOf('volitor', 'Common').xp, 150);
assert.equal(gradeOf('ignatus-power-armour', 'Common').gelt, 20000);
assert.equal(gradeOf('ignatus-power-armour', 'Common').xp, 500);
assert.equal(gradeOf('resurrection-package', 'Full Resurrection').xp, 500);

// An unknown grade falls back to the first rather than throwing mid-render.
assert.equal(gradeOf('bionic-arm', 'Sublime').grade, 'Common');
assert.equal(gradeOf('nonsense', 'Good'), null);
assert.equal(augmeticById('nonsense'), null);

/* ---- labels round-trip, and resolve through the gear catalogue ---- */

assert.equal(labelFor('bionic-arm', 'Good'), 'Good Bionic Arm');
assert.equal(labelFor('bionic-arm', 'Common'), 'Bionic Arm', 'the standard article is unmarked');
assert.equal(labelFor('resurrection-package', 'Rebuild'),
  'Cybernetic Resurrection Package (Rebuild)', 'a non-craftsmanship tier goes in a parenthetical');
assert.equal(labelFor('nonsense', 'Good'), '');

// The whole point of using craftsmanship as the grade: gearInfo already
// strips it, so every label a sheet can hold finds its catalogue entry.
for (const a of AUGMETICS) {
  for (const g of a.grades) {
    const label = labelFor(a.id, g.grade);
    const { entry, quality } = gearInfo(label);
    assert.ok(entry, 'gearInfo cannot resolve ' + label);
    assert.equal(entry.stats, a.stats);
    if (g.grade === 'Good') assert.equal(quality, 'good');
  }
}

// And back from a stored label to the item and grade.
assert.equal(readLabel('Good Bionic Arm').item.id, 'bionic-arm');
assert.equal(readLabel('Good Bionic Arm').grade, 'Good');
assert.equal(readLabel('Bionic Arm').grade, 'Common');
assert.equal(readLabel('Cybernetic Resurrection Package (Full Resurrection)').grade,
  'Full Resurrection');
assert.equal(readLabel('Ignatus Power Armour').item.kind, 'Power Armour');
assert.equal(readLabel('laspistol'), null);
assert.equal(readLabel(''), null);
assert.equal(readLabel(null), null);

// A longer name is not shadowed by a shorter one it contains.
assert.equal(readLabel('Bionic Respiratory System').item.id, 'bionic-respiratory');
assert.equal(readLabel('Good Bionic Senses').item.id, 'bionic-senses');

// Merging into GEAR must not have clobbered anything that was already there.
assert.ok(GEAR['laspistol'] && GEAR['guard flak armour']);
assert.equal(Object.keys(AUGMETIC_GEAR).length, AUGMETICS.length);
assert.equal(GEAR['bionic arm'].kind, 'Bionic');

/* ---- what a character owes ---- */

// An Explorator, or anyone off a Forge World, takes implants as initial gear.
assert.equal(isFreeFor('bionic-arm', { careerId: 'explorator' }), true);
assert.equal(isFreeFor('bionic-arm', { originId: 'forge' }), true);
assert.equal(isFreeFor('bionic-arm', { careerId: 'seneschal' }), false);
assert.equal(isFreeFor('bionic-arm', {}), false);
assert.equal(isFreeFor('nonsense', { careerId: 'explorator' }), false);

// Power armour and the GM-grant-only implants are never initial gear.
assert.equal(isFreeFor('ignatus-power-armour', { careerId: 'explorator' }), false);
assert.equal(isFreeFor('volitor', { originId: 'forge' }), false);

assert.ok(freeFor({ careerId: 'explorator' }).length >= STARTING_MAX);
assert.equal(freeFor({}).length, 0);
assert.equal(STARTING_MAX, 2);

// Free means free — no XP and no gelt.
{
  const c = costOf('bionic-arm', 'Good', { careerId: 'explorator' });
  assert.equal(c.free, true);
  assert.equal(c.xp, 0);
  assert.equal(c.gelt, 0);
  assert.equal(c.totalXp, 0);
}

// Bought as an Elite Advance, the grade's price stands.
{
  const c = costOf('bionic-arm', 'Good', { careerId: 'seneschal' });
  assert.equal(c.free, false);
  assert.equal(c.xp, 200);
  assert.equal(c.gelt, 1500);
  assert.equal(c.training, null);
  assert.equal(c.totalXp, 200);
}

// Power armour drags its training talent along, and the talent is counted.
{
  const c = costOf('light-power-armour', 'Common', {});
  assert.equal(c.xp, 300);
  assert.deepEqual(c.training, { name: 'Power Armour Training', xp: 200 });
  assert.equal(c.totalXp, 500, '300 for the suit, 200 for the training');

  // ...unless the character already has it.
  const trained = costOf('light-power-armour', 'Common', { talents: ['Power Armour Training'] });
  assert.equal(trained.training, null);
  assert.equal(trained.totalXp, 300);
}

// A mechadendrite needs the talent too, and it is not free even for a
// Tech-Priest who takes the limb as starting gear.
{
  const c = costOf('mechadendrite', 'Common', { careerId: 'explorator' });
  assert.equal(c.free, true);
  assert.equal(c.xp, 0);
  assert.equal(c.training, null, 'no trainingXp on this entry, so nothing to charge');
}

// The free slots run out: one or two implants at creation, and the third is
// bought like anyone else's.
{
  const who = { careerId: 'explorator' };
  const taken = ['Good Bionic Arm', 'Bionic Leg'];
  assert.equal(freeUsedIn(taken, who), 2);
  assert.equal(freeUsedIn(['laspistol', 'Ignatus Power Armour'], who), 0,
    'ordinary gear and ineligible suits spend no slot');
  assert.equal(freeUsedIn([], who), 0);

  const third = costOf('bionic-senses', 'Good', { ...who, freeUsed: 2 });
  assert.equal(third.free, false);
  assert.equal(third.xp, 200);
  assert.equal(costOf('bionic-senses', 'Good', { ...who, freeUsed: 1 }).free, true);
}

// Something with no price quotes the note instead of a number.
assert.equal(costOf('astartes-power-armour', 'Common', {}).gelt, null);
assert.match(costOf('astartes-power-armour', 'Common', {}).geltNote, /relic/i);
assert.equal(costOf('nonsense', 'Common', {}), null);

/* ---- availability, and the Throne price as an Acquisition input ---- */

// Every entry is findable somewhere on the ladder, or the dialog quotes a
// modifier of 0 for something that should be all but unobtainable.
for (const a of AUGMETICS) {
  assert.ok(AVAILABILITY.some((x) => x.rating === a.availability),
    a.id + ' has no availability rating: ' + a.availability);
}
assert.equal(availabilityMod('Very Rare'), -30);

// The two ratings the table states outright.
assert.equal(ratingFor('bionic-arm', 'Good'), 'Very Rare');
assert.equal(ratingFor('light-power-armour', 'Common'), 'Very Rare');

// A Good article is a step rarer than the standard one, which is how the same
// item is Rare at 500 Thrones and Very Rare at 1,500.
assert.equal(ratingFor('bionic-arm', 'Common'), 'Rare');
assert.equal(ratingFor('astartes-power-armour', 'Best'), 'Unique', 'the bottom is the bottom');
assert.equal(ratingFor('nonsense', 'Good'), 'Average');

// THE PRICE IS NOT A WALLET, it is the Scale of the test. The same suit is a
// Major purchase for a modest dynasty and a Standard one for a rich one.
{
  const poor = acquisitionFor('light-power-armour', 'Common', { profitFactor: 20 });
  assert.equal(poor.rating, 'Very Rare');
  assert.equal(poor.scale.id, 'major');
  assert.equal(poor.target, -20, '20 − 30 rarity − 10 scale: not on money alone');
  assert.equal(poor.pfCost, 1);

  const rich = acquisitionFor('light-power-armour', 'Common', { profitFactor: 50 });
  assert.equal(rich.scale.id, 'standard');
  assert.equal(rich.target, 20, 'the campaign arc is the dynasty growing into it');
  assert.equal(rich.pfCost, 0);
}

// A Common bionic arm is simply gettable; the Good one is a gamble.
assert.equal(acquisitionFor('bionic-arm', 'Common', { profitFactor: 20 }).target, 20);
assert.equal(acquisitionFor('bionic-arm', 'Good', { profitFactor: 20 }).target, 0);

// Something with no price is not free — it is not for sale, and a relic stays
// out of reach however rich the dynasty gets.
{
  const relic = acquisitionFor('astartes-power-armour', 'Common', { profitFactor: 80 });
  assert.equal(relic.scale.id, 'vast');
  assert.ok(relic.target < 0);
  assert.equal(relic.pfCost, 2);
}
assert.equal(acquisitionFor('nonsense', 'Common', {}), null);

/* ---- requisition: standing, not a discount ---- */

// The Ecclesiarchy will issue a Missionary light plate. It still costs.
assert.equal(hasRequisition('light-power-armour', { careerId: 'missionary' }), true);
assert.equal(hasRequisition('light-power-armour', { careerId: 'seneschal' }), false);
assert.equal(hasRequisition('bionic-arm', { careerId: 'missionary' }), false);
assert.equal(hasRequisition('light-power-armour', {}), false);
{
  const c = costOf('light-power-armour', 'Common', { careerId: 'missionary' });
  assert.equal(c.requisition, true);
  assert.equal(c.free, false, 'a requisition route is not a free slot');
  assert.equal(c.gelt, 10000);
  assert.equal(c.totalXp, 500);
}

// And what the standing is actually worth: the door money could not open.
{
  const cold = acquisitionFor('light-power-armour', 'Common', { profitFactor: 20 });
  const issued = acquisitionFor('light-power-armour', 'Common',
    { profitFactor: 20, careerId: 'missionary' });
  assert.equal(issued.target - cold.target, STANDING);
  assert.equal(issued.target, 10, 'out of reach becomes a real roll');
  assert.equal(issued.pfCost, 1, 'the Order issues it; the dynasty still carries the cost');
}

// The arm, however, is a starting option for a Missionary as the table has it.
assert.equal(isFreeFor('bionic-arm', { careerId: 'missionary' }), true);
assert.equal(costOf('bionic-arm', 'Good', { careerId: 'missionary' }).xp, 0);

/* ---- conditionals come from what is actually worn ---- */

// A Good arm grants its bonus; a Common one does not.
assert.equal(conditionalsFor(['Good Bionic Arm'], 's').length, 1);
assert.equal(conditionalsFor(['Bionic Arm'], 's').length, 0, 'grade-gated, and Common is below it');
assert.equal(conditionalsFor(['Good Bionic Arm'], 'ws').length, 0, 'wrong characteristic');

// An ungraded conditional applies at any grade.
assert.equal(conditionalsFor(['Bionic Respiratory System'], 't').length, 1);
assert.equal(conditionalsFor(['Good Bionic Respiratory System'], 't').length, 1);

// Power armour's Strength is conditional on the suit being powered, never a
// flat modifier — the whole reason it lives here and not in the totals.
{
  const c = conditionalsFor(['Ignatus Power Armour'], 's');
  assert.equal(c.length, 1);
  assert.equal(c[0].mod, 20);
  assert.match(c[0].when, /powered/);
  assert.equal(c[0].from, 'Ignatus Power Armour');
  assert.equal(conditionalsFor(['Ignatus Power Armour'], 'bs')[0].mod, 10);
}

// Ordinary gear contributes nothing, and neither does an empty sheet.
assert.deepEqual(conditionalsOf(['laspistol', 'void suit']), []);
assert.deepEqual(conditionalsOf([]), []);
assert.deepEqual(conditionalsOf(null), []);

// Two augmetics both report, each naming itself.
{
  const both = conditionalsOf(['Good Bionic Arm', 'Good Bionic Leg']);
  assert.equal(both.length, 2);
  assert.deepEqual(both.map((c) => c.from), ['Good Bionic Arm', 'Good Bionic Leg']);
}

console.log('augmetics.js OK (%d implants and suits)', AUGMETICS.length);
