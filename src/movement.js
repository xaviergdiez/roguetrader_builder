// Movement distances, derived from Agility Bonus alone.
//
// Source: the Rogue Trader (FFG, 2009) core rulebook Movement table, plus
// the Jumping and Leaping rules just below it on the same page.
//   Half Move = AB          Full Move = AB x 2
//   Charge    = AB x 3      Run       = AB x 6
// A standing jump (no run-up, part of a Half Move, no test needed) covers
// half Agility Bonus, rounded down; a running leap (after a Full Move,
// needs an Acrobatics Test) covers the full Agility Bonus.
//
// Pure: see movement.check.mjs.

export function movementFor(agilityBonus) {
  const ab = Math.max(0, Math.floor(agilityBonus || 0));
  return {
    halfMove: ab,
    fullMove: ab * 2,
    charge: ab * 3,
    run: ab * 6,
    jump: Math.floor(ab / 2),
    leap: ab
  };
}
