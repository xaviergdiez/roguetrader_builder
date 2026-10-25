// Self-check for wound tracking. Run: node src/wounds.check.mjs
import assert from 'node:assert/strict';
import { woundState, applyDamage, adjustMax } from './wounds.js';

// undamaged: current equals max
assert.deepEqual(woundState(13, 0, 0), { max: 13, taken: 0, current: 13, down: false });

// damage reduces current, not max
assert.deepEqual(woundState(13, 0, 4), { max: 13, taken: 4, current: 9, down: false });

// at exactly max the character is down, and current floors at 0
assert.deepEqual(woundState(13, 0, 13), { max: 13, taken: 13, current: 0, down: true });

// damage beyond max clamps rather than going negative
assert.deepEqual(woundState(13, 0, 99), { max: 13, taken: 13, current: 0, down: true });

// THE REASON DAMAGE IS STORED, NOT CURRENT: a level-up raises max, and the
// character gains that wound instead of staying pinned at the old current.
const hurt = woundState(13, 0, 4);
const levelled = woundState(13, 1, 4);
assert.equal(hurt.current, 9);
assert.equal(levelled.max, 14);
assert.equal(levelled.current, 10, 'raising max must raise current too');
assert.equal(levelled.taken, 4, 'damage taken is unchanged by a level-up');

// a downed character brought back up by a level-up is no longer down
assert.equal(woundState(13, 0, 13).down, true);
assert.equal(woundState(13, 2, 13).down, false);
assert.equal(woundState(13, 2, 13).current, 2);

// no base (nothing rolled yet) means no gauge at all
assert.equal(woundState(null, 0, 0), null);

// applyDamage clamps at both ends
assert.equal(applyDamage(0, 1, 13), 1);
assert.equal(applyDamage(0, -1, 13), 0, 'healing an unhurt character is a no-op');
assert.equal(applyDamage(13, 1, 13), 13, 'cannot take damage past the maximum');
assert.equal(applyDamage(5, -2, 13), 3);

// adjustMax refuses to push the maximum below 1
assert.equal(adjustMax(13, 0, 1), 1);
assert.equal(adjustMax(13, 0, -1), -1);
assert.equal(adjustMax(1, 0, -1), 0, 'blocked: would leave a maximum of 0');
assert.equal(adjustMax(3, -2, -1), -2, 'blocked at the floor, bonus unchanged');

console.log('wounds: all checks passed');

/* ---- downtime healing (Rogue Trader p.262) ---- */
{
  const { damageState, downtimeHealing } = await import('./wounds.js');
  assert.equal(damageState(0, 4), 'healthy');
  assert.equal(damageState(8, 4), 'light', 'twice TB is still Lightly Damaged');
  assert.equal(damageState(9, 4), 'heavy');
  assert.equal(damageState(3, 4, 2), 'critical');

  // The book's examples: Grak, TB 4, 5 Damage: 1 a day, or 4 with a day's bed rest.
  assert.equal(downtimeHealing({ damage: 5, toughnessBonus: 4, days: 1 }).damage, 4);
  assert.equal(downtimeHealing({ damage: 5, toughnessBonus: 4, days: 1, rest: true }).damage, 1);
  // 12 Damage is Heavily Damaged (> 8). A week's complete rest removes TB (4) -> 8,
  // which is Lightly Damaged again.
  const heavy = downtimeHealing({ damage: 12, toughnessBonus: 4, days: 7, rest: true });
  assert.equal(heavy.damage, 8);
  assert.equal(heavy.state, 'light');
  // Without rest a Heavily Damaged character heals 1 a week.
  assert.equal(downtimeHealing({ damage: 12, toughnessBonus: 4, days: 7 }).damage, 11);
  assert.equal(downtimeHealing({ damage: 12, toughnessBonus: 4, days: 6 }).damage, 12, 'not before the week is out');
  // Critical Damage needs rest AND medical attention, 1 a week.
  assert.equal(downtimeHealing({ damage: 12, critical: 3, toughnessBonus: 4, days: 21, rest: true }).critical, 3);
  assert.equal(downtimeHealing({ damage: 12, critical: 3, toughnessBonus: 4, days: 21, rest: true, medical: true }).critical, 0);
  assert.equal(downtimeHealing({ damage: 12, critical: 3, toughnessBonus: 4, days: 14, rest: true, medical: true }).critical, 1);
  assert.equal(downtimeHealing({ damage: 12, critical: 1, toughnessBonus: 4, days: 7, rest: true, medical: true }).state, 'heavy',
    'once critical damage is gone he is Heavily Damaged');
}
console.log('wounds.check.mjs: downtime healing passed');
