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
