// d100 test resolution for Rogue Trader (FFG, 2009).
// Roll under the target; every full 10 points of margin is a degree.
// Pure, with the RNG injectable — see dice.check.mjs.

export const roll1d100 = (rng = Math.random) => 1 + Math.floor(rng() * 100);

// The difficulty ladder as printed. Challenging is the unmodified test.
export const DIFFICULTIES = [
  { label: 'Trivial', mod: 60 },
  { label: 'Elementary', mod: 50 },
  { label: 'Simple', mod: 40 },
  { label: 'Easy', mod: 30 },
  { label: 'Routine', mod: 20 },
  { label: 'Ordinary', mod: 10 },
  { label: 'Challenging', mod: 0 },
  { label: 'Difficult', mod: -10 },
  { label: 'Hard', mod: -20 },
  { label: 'Very Hard', mod: -30 }
];

export function resolveTest(base, modifier, roll) {
  const target = base + modifier;
  // Common table rule: 01-05 always succeeds and 96-00 always fails whatever
  // the target. Flagged in the result so the sheet can label it, rather than
  // silently contradicting the arithmetic on screen.
  const automatic = roll <= 5 ? 'success' : roll >= 96 ? 'failure' : null;
  const success = automatic ? automatic === 'success' : roll <= target;
  // Margin is measured from the side the roll landed on, so degrees are never
  // negative — an automatic result can leave the margin the wrong way round.
  const margin = success ? target - roll : roll - target;
  const degrees = Math.max(0, Math.floor(margin / 10));
  return { roll, target, success, degrees, automatic: automatic != null };
}
