// Conditional test modifiers carried by origin-path traits and notes.
//
// These are deliberately NOT folded into characteristic totals. "-10 to
// Interaction Tests in formal surroundings" must not lower Fellowship
// everywhere — it applies only when the situation calls for it. So they
// surface in the dice roller as toggles instead, and the flat modifiers
// (mods / wounds / fate / profit) remain the only things that move the sheet.
//
// Keyed by origin-path item id rather than by matching the prose, because the
// ids are stable and the wording is not.
//
// chars lists the characteristics a modifier can apply to, so the roller only
// offers what is relevant to the test being made.

export const CONDITIONALS = {
  death: [
    { from: 'Paranoid', mod: -10, chars: ['fel'], when: 'Interaction Tests in formal surroundings' },
    { from: 'Survivor', mod: 10, chars: ['wp', 't'], when: 'resisting Pinning or Shock' }
  ],
  void: [
    { from: 'Ill-Omened', mod: -5, chars: ['fel'], when: 'dealing with non-void born humans' }
  ],
  forge: [
    { from: 'Stranger to the Cult', mod: -10, chars: ['int'], when: 'Tests involving the Imperial Creed' },
    { from: 'Stranger to the Cult', mod: -5, chars: ['fel'], when: 'dealing with the Ecclesiarchy formally' }
  ],
  hive: [
    { from: 'Hivebound', mod: -10, chars: ['int'], when: 'Survival Tests' },
    { from: 'Hivebound', mod: -5, chars: ['int'], when: 'outside a proper hab' },
    { from: 'Wary', mod: 1, chars: ['ag'], when: 'Initiative rolls' }
  ],
  imperial: [
    { from: 'Blessed Ignorance', mod: -5, chars: ['int'], when: 'Forbidden Lore Tests' }
  ],
  noble: [
    { from: 'Etiquette', mod: 10, chars: ['fel'], when: 'high authority or formal situations' }
  ],
  duty: [
    { from: 'Duty Bound', mod: -10, chars: ['fel'], when: 'Interaction outside the Imperium' }
  ],
  zealot: [
    { from: 'Zealot', mod: 10, chars: ['s'], when: 'Intimidate Tests' },
    { from: 'Zealot', mod: -10, chars: ['fel'], when: 'Charm Tests' }
  ],
  destiny: [
    { from: 'Chosen by Destiny', mod: 10, chars: ['fel'], when: 'dealing with aliens' },
    { from: 'Chosen by Destiny', mod: -5, chars: ['wp'], when: 'resisting alien artefacts and powers' }
  ],
  handofwar: [
    { from: 'The Face of the Enemy', mod: -10, chars: ['fel'], when: 'dealing with your sworn foe' }
  ]
};

// Every conditional the character has, from whichever origin-path items are
// picked. `picked` is build.picked — a map of step id -> chosen item.
export function conditionalsOf(picked) {
  const out = [];
  for (const item of Object.values(picked || {})) {
    if (item && CONDITIONALS[item.id]) out.push(...CONDITIONALS[item.id]);
  }
  return out;
}

// Only those that could apply to a test of this characteristic.
export function conditionalsFor(picked, charKey) {
  return conditionalsOf(picked).filter((c) => c.chars.includes(charKey));
}
