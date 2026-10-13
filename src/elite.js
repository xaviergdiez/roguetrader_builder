// Named Elite Advances: off-table upgrades the GM grants for XP.
//
// The Elite Advance dialog has always taken free text, because the whole
// point of one is that it is NOT on a career table — a GM invents it at the
// table. What free text cannot hold is a requirement: "Executioner, if you
// are a Bladedancer" has nowhere to live when the only fields are a name, a
// type and a number.
//
// So this is a short catalogue of the ones worth offering by name, each
// carrying what it costs and what it asks of the character. It is a
// shortcut, never a gate: meetsRequirement() reports, and the dialog shows
// what it reports, but the GM may still grant any of these to anyone. Elite
// Advances are the one place the rank ladder deliberately does not apply —
// see addEliteAdvance in the app — and a requirement printed here must not
// quietly become a lock.

export const ELITE_ADVANCES = [
  {
    id: 'executioner',
    name: 'Executioner',
    type: 'Trait',
    cost: 500,
    // The CRPG enters this at level 15 from the Warrior, Operative or
    // Bladedancer lines. Of those only the Bladedancer exists here; Warrior
    // is rendered as the Arch-Militant, which is this app's career for
    // someone who fights for a living.
    careers: ['Bladedancer', 'Arch-Militant'],
    minRank: 4,
    requires: 'Bladedancer or Arch-Militant, Rank IV',
    effect: 'Scourging Strikes: a living target you wound in melee keeps bleeding, '
      + 'taking 1 damage at the start of each of its turns, stacking to a maximum of '
      + 'your Perception Bonus + Strength Bonus. It stops on a successful Challenging '
      + '(+0) Toughness Test at the end of its turn, or on any First Aid.',
    note: 'A Tier II archetype from the Rogue Trader CRPG, converted. The GM sets the '
      + 'cost and may grant it to anyone — the requirement is advice, not a lock.'
  }
];

export const eliteById = (id) => ELITE_ADVANCES.find((e) => e.id === id) || null;

// Does this character match what the entry asks for? Reported so the dialog
// can mark it, never used to disable the button.
export function meetsRequirement(entry, { careerName = '', rank = 0 } = {}) {
  if (!entry) return false;
  const careerOk = !entry.careers || entry.careers.length === 0
    || entry.careers.includes(careerName);
  const rankOk = !entry.minRank || (Number(rank) || 0) >= entry.minRank;
  return Boolean(careerOk && rankOk);
}

// Everything, each tagged with whether this character matches it. The list is
// not filtered: a GM looking for something to grant should see the whole
// catalogue, with the ones that fit marked.
export const elitePresets = (who) =>
  ELITE_ADVANCES.map((e) => ({ ...e, met: meetsRequirement(e, who) }));
