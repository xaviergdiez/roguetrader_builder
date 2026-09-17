// Self-check for character-scale criticals. Run: node src/crits.check.mjs
import assert from 'node:assert/strict';
import {
  hitLocation, reverseRoll, LOCATIONS, DAMAGE_TYPES, critRow, critRows,
  summarise, resolveHit, furyTriggered, CRIT_MAX
} from './crits.js';

/* ---- hit location is the roll read backwards ---- */

assert.equal(reverseRoll(47), 74);
assert.equal(reverseRoll(9), 90);      // 09 -> 90
assert.equal(reverseRoll(10), 1);      // 10 -> 01
assert.equal(reverseRoll(100), 100);   // 00 -> 00, which is 100
assert.equal(reverseRoll('x'), null);

assert.equal(hitLocation(47).id, 'rleg');   // 74
assert.equal(hitLocation(1).id, 'head');    // 10 -> 01
assert.equal(hitLocation(100).id, 'lleg');
assert.equal(hitLocation(34).id, 'body');   // 43
assert.equal(hitLocation(11).id, 'rarm');   // 11
assert.equal(hitLocation(12).id, 'larm');   // 21
assert.equal(hitLocation(47).roll, 74, 'the reversed number is reported, not the original');

// Every band of the location table is reachable, and nothing falls through.
{
  const seen = new Set();
  for (let r = 1; r <= 100; r++) {
    const l = hitLocation(r);
    assert.ok(l && l.id, `roll ${r} has no location`);
    seen.add(l.id);
  }
  assert.equal(seen.size, LOCATIONS.length, 'all six locations are reachable');
}

/* ---- the tables are complete ---- */

for (const t of DAMAGE_TYPES) {
  for (const loc of LOCATIONS) {
    for (let n = 1; n <= CRIT_MAX; n++) {
      const row = critRow(t.id, loc.id, n);
      assert.ok(row && row.effect, `${t.id}/${loc.id}/${n} is missing`);
      assert.equal(row.level, n);
    }
    // Row 10 kills, whatever the limb — the table has no survivable top row.
    assert.equal(critRow(t.id, loc.id, 10).dead, true, `${t.id}/${loc.id}/10 is not fatal`);
  }
}

// Left and right of a pair read from the same column.
assert.equal(critRow('impact', 'rarm', 4).effect, critRow('impact', 'larm', 4).effect);
assert.notEqual(critRow('impact', 'rarm', 4).effect, critRow('impact', 'rleg', 4).effect);

// Past the bottom of the table there is nothing further to look up.
assert.equal(critRow('energy', 'head', 14).level, 10);
assert.equal(critRow('energy', 'head', 0), null);
assert.equal(critRow('nonsense', 'head', 3), null);
assert.equal(critRow('energy', 'nose', 3), null);

/* ---- every row up to the level applies, not just the last ---- */

assert.deepEqual(critRows('impact', 'body', 3).map((r) => r.level), [1, 2, 3]);
assert.deepEqual(critRows('impact', 'body', 7, 6).map((r) => r.level), [6, 7]);
assert.equal(critRows('impact', 'body', 40).length, CRIT_MAX);
assert.deepEqual(critRows('impact', 'body', 0), []);

/* ---- soak comes off each hit, the excess is critical damage ---- */

// Armour 4 against Pen 2 stops 2, plus TB 3: 12 damage becomes 7.
{
  const r = resolveHit({ damage: 12, penetration: 2, armour: 4, toughnessBonus: 3, wounds: 10 });
  assert.equal(r.soak, 5);
  assert.equal(r.taken, 7);
  assert.equal(r.woundsLost, 7);
  assert.equal(r.woundsLeft, 3);
  assert.equal(r.overflow, 0);
  assert.deepEqual(r.rows, [], 'wounds still standing means no critical');
}

// Penetration cannot turn armour into a bonus.
assert.equal(resolveHit({ damage: 10, penetration: 99, armour: 4, toughnessBonus: 3 }).soak, 3);

// Soak larger than the damage is no damage, not negative damage.
{
  const r = resolveHit({ damage: 3, armour: 6, toughnessBonus: 4, wounds: 5 });
  assert.equal(r.taken, 0);
  assert.equal(r.woundsLeft, 5);
}

// 2 Wounds left, 7 through: 2 Wounds and five rows of critical.
{
  const r = resolveHit({ damage: 7, wounds: 2, type: 'rending', location: 'body' });
  assert.equal(r.woundsLost, 2);
  assert.equal(r.woundsLeft, 0);
  assert.equal(r.overflow, 5);
  assert.equal(r.critTotal, 5);
  assert.deepEqual(r.rows.map((x) => x.level), [1, 2, 3, 4, 5]);
}

// Criticals accumulate: the next hit starts where the last one stopped.
{
  const r = resolveHit({ damage: 2, wounds: 0, critSoFar: 5, type: 'rending', location: 'body' });
  assert.deepEqual(r.rows.map((x) => x.level), [6, 7], 'rows already suffered are not repeated');
  assert.equal(r.critTotal, 7);
}

// Enough overflow reaches the fatal row and says so.
{
  const r = resolveHit({ damage: 15, wounds: 1, type: 'impact', location: 'head' });
  assert.equal(r.summary.dead, true);
  assert.equal(r.rows.length, CRIT_MAX, 'and stops at the bottom of the table');
}

/* ---- Righteous Fury lands a critical on a target at full Wounds ---- */

assert.equal(furyTriggered([10, 4]), true);
assert.equal(furyTriggered([9, 4]), false);
assert.equal(furyTriggered(null), false);

{
  const r = resolveHit({
    damage: 8, armour: 2, toughnessBonus: 3, wounds: 20,
    type: 'energy', location: 'head', fury: { confirmed: true, d5: 3 }
  });
  assert.equal(r.overflow, 0, 'Wounds are untouched');
  assert.equal(r.woundsLeft, 17);
  assert.deepEqual(r.furyRows.map((x) => x.level), [1, 2, 3], 'but the table still comes out');
}

// An unconfirmed Fury does nothing, and the d5 is held to 1-5.
assert.deepEqual(resolveHit({ damage: 5, wounds: 9, fury: { confirmed: false, d5: 4 } }).furyRows, []);
assert.equal(resolveHit({ damage: 5, wounds: 9, fury: { confirmed: true, d5: 99 } }).furyRows.length, 5);

/* ---- the summary is what the sheet shows ---- */

{
  const s = summarise(critRows('rending', 'head', 5));
  assert.ok(s.fatigue >= 1);
  assert.ok(s.conditions.includes('Blood Loss'), 'a bleed anywhere in the range is carried');
  assert.equal(s.dead, false);
  assert.ok(s.mods.fel < 0, 'lasting characteristic damage totals up');
}
{
  const s = summarise(critRows('rending', 'rarm', 9));
  assert.ok(s.lost.includes('arm'), 'what is gone for good is named');
  assert.ok(s.conditions.includes('Helpless'));
}
assert.deepEqual(summarise([]), { fatigue: 0, conditions: [], mods: {}, lost: [], dead: false, delay: null });

// A row that grants a round of grace reports it rather than swallowing it.
assert.equal(summarise([critRow('explosive', 'body', 9)]).delay, 'end of the round');

console.log('crits.js OK');
