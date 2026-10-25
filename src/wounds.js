// Wound tracking. Damage taken is stored, not current wounds — so when the max
// rises (a level-up, or Sound Constitution) the character gains those wounds
// instead of staying at the old current value. Pure: see wounds.check.mjs.

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// base   — derived from the origin path (2 x TB + roll + origin bonuses)
// bonus  — manual adjustment for level-ups, may be negative to undo a misclick
// damage — total taken so far
export function woundState(base, bonus, damage) {
  if (base == null) return null;
  const max = Math.max(1, base + (bonus || 0));
  const taken = clamp(damage || 0, 0, max);
  return { max, taken, current: max - taken, down: taken >= max };
}

// n is positive to wound, negative to heal
export function applyDamage(damage, n, max) {
  return clamp((damage || 0) + n, 0, max);
}

// Never let the manual bonus drag the maximum below 1 — a character with a
// 0 maximum can neither be hurt nor healed, which is a dead end in the UI.
export function adjustMax(base, bonus, n) {
  const next = (bonus || 0) + n;
  return base + next < 1 ? bonus || 0 : next;
}

/* ------------------------------ downtime healing ------------------------------
   Rogue Trader p.262. Three states, by Damage taken against Toughness Bonus:

     Lightly Damaged   Damage <= 2 x TB. Heals 1 a day; a day of bed rest
                       heals TB instead.
     Heavily Damaged   Damage > 2 x TB. Heals 1 a week; a week of complete
                       rest heals TB. Once Damage is back to TB or less the
                       character is Lightly Damaged again (the 2xTB rule
                       takes over on its own).
     Critically        Critical Damage never heals unaided. With rest AND
     Damaged           medical attention, 1 point of it heals each week; when
                       it is gone the character is Heavily Damaged.

   Used for the campaign calendar, where a stretch of downtime is a number of
   days. `rest` is bed rest for the whole stretch; `medical` is medical
   attention for the whole stretch. */

export function damageState(damage, toughnessBonus, critical = 0) {
  const tb = Math.max(0, Math.floor(Number(toughnessBonus) || 0));
  if ((Number(critical) || 0) > 0) return 'critical';
  const d = Math.max(0, Number(damage) || 0);
  if (d <= 0) return 'healthy';
  return d <= 2 * tb ? 'light' : 'heavy';
}

export function downtimeHealing({ damage = 0, critical = 0, toughnessBonus = 0, days = 0, rest = false, medical = false } = {}) {
  const tb = Math.max(0, Math.floor(Number(toughnessBonus) || 0));
  let dmg = Math.max(0, Math.floor(Number(damage) || 0));
  let crit = Math.max(0, Math.floor(Number(critical) || 0));
  const total = Math.max(0, Math.floor(Number(days) || 0));
  let sinceWeek = 0;

  for (let day = 1; day <= total; day++) {
    sinceWeek += 1;
    const weekDone = sinceWeek === 7;
    if (weekDone) sinceWeek = 0;

    // Critical Damage: only through rest AND medical attention, once a week.
    if (crit > 0) {
      if (weekDone && rest && medical) crit -= 1;
      continue;
    }
    const tbHeal = tb;
    if (dmg > 0 && dmg <= 2 * tb) {
      dmg = Math.max(0, dmg - (rest ? tbHeal : 1));
    } else if (dmg > 2 * tb && weekDone) {
      dmg = Math.max(0, dmg - (rest ? tbHeal : 1));
    }
  }
  return { damage: dmg, critical: crit, state: damageState(dmg, tb, crit) };
}
