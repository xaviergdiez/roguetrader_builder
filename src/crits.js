// Character-scale combat: hit location, soak, and the critical damage tables.
//
// TWO WAYS A CHARACTER TAKES A CRITICAL, and they are not the same thing:
//
//   1. Damage that runs past 0 Wounds. The EXCESS is critical damage, and
//      every row from 1 up to that total applies — not just the last one. A
//      target on 2 Wounds hit for 7 after soak takes rows 1 to 5.
//   2. Righteous Fury. A natural 10 on a damage die earns another attack
//      roll; if that hits, roll 1d5 on the table and apply that row, even on
//      a target at full Wounds.
//
// Critical damage ACCUMULATES across hits, so the caller passes critSoFar.
// Past row 10 the target is dead; the table stops there.
//
// Hit location is the attack roll read backwards: a 47 hits location 74, a
// leg. That is why a d100 result has to reach this module unmodified.
//
// The effects are condensed to what a table needs to adjudicate (Rogue
// Trader, 2009, Critical Damage tables). Flags carry the mechanical part so
// the sheet can total Fatigue and notice a death instead of the reader
// parsing prose.

/* ------------------------------ hit location ------------------------------ */

export const LOCATIONS = [
  { id: 'head', name: 'Head', group: 'head' },
  { id: 'rarm', name: 'Right Arm', group: 'arm' },
  { id: 'larm', name: 'Left Arm', group: 'arm' },
  { id: 'body', name: 'Body', group: 'body' },
  { id: 'rleg', name: 'Right Leg', group: 'leg' },
  { id: 'lleg', name: 'Left Leg', group: 'leg' }
];

export const locationById = (id) => LOCATIONS.find((l) => l.id === id) || null;

// The roll reversed, then read off the location table. 100 reads as 00, which
// reverses to 00 and lands on the left leg.
export function reverseRoll(roll) {
  const n = Number(roll);
  if (!Number.isFinite(n)) return null;
  const two = ((Math.round(n) % 100) + 100) % 100;        // 100 -> 0
  const back = (two % 10) * 10 + Math.floor(two / 10);
  return back === 0 ? 100 : back;
}

export function hitLocation(roll) {
  const n = reverseRoll(roll);
  if (n == null) return null;
  const id = n <= 10 ? 'head'
    : n <= 20 ? 'rarm'
      : n <= 30 ? 'larm'
        : n <= 70 ? 'body'
          : n <= 85 ? 'rleg' : 'lleg';
  return { ...locationById(id), roll: n };
}

/* ------------------------------ damage types ------------------------------ */

export const DAMAGE_TYPES = [
  { id: 'impact', code: 'I', name: 'Impact' },
  { id: 'energy', code: 'E', name: 'Energy' },
  { id: 'rending', code: 'R', name: 'Rending' },
  { id: 'explosive', code: 'X', name: 'Explosive' }
];

export const damageTypeById = (id) =>
  DAMAGE_TYPES.find((t) => t.id === id || t.code === id) || null;

/* ---------------------------- the tables ----------------------------
   Ten rows each, indexed by position. Flags: fatigue, stun (rounds, as
   written so the GM rolls it), prone, blood (Blood Loss), fire (On Fire),
   helpless, dead, drop (drops what the hand holds), lost (what is gone for
   good), blind / deaf / mute, mods (lasting characteristic penalties). */

const C = (effect, flags) => ({ effect, ...(flags || {}) });

const ENERGY = {
  head: [
    C('Hair and eyebrows burn away. The smell is worse than the wound.', { fatigue: 1 }),
    C('Face scorched raw.', { fatigue: 1, mods: { fel: -10 }, until: 'healed' }),
    C('Eardrums burst in the heat.', { fatigue: 1, deaf: '1d10 hours' }),
    C('Superheated air across the eyes.', { blind: '1d10 rounds', stun: '1' }),
    C('The skull cooks. Scarring is permanent.', { stun: '1d10', fatigue: 2, mods: { fel: -20 } }),
    C('Jaw and tongue seared. No speech until surgery.', { fatigue: 2, mute: true, stun: '1d5' }),
    C('Both eyes destroyed.', { lost: 'both eyes', blind: 'permanently', stun: '1d10' }),
    C('The brain cooks in its case.', { stun: '1d10', mods: { int: -10 }, helpless: '1d5 rounds' }),
    C('The head catches fire. Dies in 1d5 rounds without Medicae.', { fire: true, helpless: true, dying: '1d5 rounds' }),
    C('The head is gone, vaporised to the collar.', { dead: true })
  ],
  body: [
    C('Torso scorched.', { fatigue: 1 }),
    C('Clothing smoulders. Anything flammable may go up.', { fatigue: 1 }),
    C('Chest badly burned.', { fatigue: 2, mods: { ag: -10 }, until: 'healed' }),
    C('The blast wave puts the target down.', { prone: true, stun: '1', fatigue: 1 }),
    C('Ribs cooked through.', { stun: '1d5', fatigue: 2 }),
    C('Clothing and gear ignite.', { fire: true, prone: true }),
    C('Organs cooked.', { stun: '1d10', mods: { t: -20 }, fire: true, until: 'healed' }),
    C('The torso ruptures. Dies in 1d5 rounds without Medicae.', { helpless: true, blood: true, dying: '1d5 rounds' }),
    C('The chest cavity burns out. The target may act until the end of the next round, then dies.', { dead: true, delay: 'end of next round' }),
    C('The torso is vaporised.', { dead: true })
  ],
  arm: [
    C('Arm scorched.', { fatigue: 1 }),
    C('The hand sears and opens.', { fatigue: 1, drop: true }),
    C('Forearm blistered.', { mods: { arm: -10 }, until: 'healed' }),
    C('Muscle cooks and cramps.', { drop: true, stun: '1' }),
    C('The arm is useless for 1d10 rounds.', { fatigue: 2, disabled: '1d10 rounds' }),
    C('Tendons burn through. The arm never works properly again.', { drop: true, mods: { arm: -20 } }),
    C('The hand burns away.', { lost: 'hand', fatigue: 2, blood: true }),
    C('The arm chars to the bone.', { lost: 'arm', stun: '1d5' }),
    C('The arm is destroyed and the blast carries into the torso.', { lost: 'arm', stun: '1d10', blood: true }),
    C('The arm is vaporised and the target burns from the inside.', { dead: true })
  ],
  leg: [
    C('Leg scorched.', { fatigue: 1 }),
    C('The boot burns through.', { fatigue: 1, slow: 'half Movement this round' }),
    C('Thigh blistered.', { mods: { ag: -10 }, until: 'healed' }),
    C('The knee cooks and folds.', { prone: true, fatigue: 1 }),
    C('The leg gives out.', { prone: true, fatigue: 2, slow: 'Movement halved for 1d10 rounds' }),
    C('Tendons burn through.', { prone: true, slow: 'Movement permanently halved' }),
    C('The foot burns away.', { lost: 'foot', prone: true, fatigue: 2 }),
    C('The leg chars through below the hip.', { lost: 'leg', stun: '1d5', prone: true }),
    C('The leg is destroyed and the target burns.', { lost: 'leg', fire: true, helpless: true }),
    C('The blast burns up through the body.', { dead: true })
  ]
};

const IMPACT = {
  head: [
    C('The blow rocks the skull.', { fatigue: 1 }),
    C('Nose broken.', { fatigue: 1, mods: { fel: -10 }, until: 'healed' }),
    C('Ears ring.', { fatigue: 1, deaf: '1d5 rounds' }),
    C('Teeth knocked out.', { stun: '1', mods: { fel: -10 } }),
    C('Concussion.', { stun: '1d5', fatigue: 2 }),
    C('The skull cracks.', { stun: '1d10', mods: { int: -10 }, blood: true, until: 'healed' }),
    C('Jaw shattered. No speech until surgery.', { stun: '1d10', mute: true, blood: true }),
    C('An eye socket caves in.', { lost: 'an eye', stun: '1d10', blood: true }),
    C('The skull caves in. Dies in 1d5 rounds without Medicae.', { helpless: true, blood: true, dying: '1d5 rounds' }),
    C('The head is crushed.', { dead: true })
  ],
  body: [
    C('Winded.', { fatigue: 1 }),
    C('Ribs bruised.', { fatigue: 1, mods: { ag: -10 }, until: 'healed' }),
    C('Knocked off the feet.', { prone: true, fatigue: 1 }),
    C('A rib cracks.', { stun: '1', fatigue: 2 }),
    C('Ribs broken.', { stun: '1d5', mods: { t: -10 }, until: 'healed' }),
    C('The sternum caves.', { stun: '1d10', prone: true, blood: true }),
    C('Internal bleeding.', { blood: true, fatigue: 3, mods: { t: -20 }, until: 'healed' }),
    C('Organs rupture.', { helpless: '1d10 rounds', blood: true }),
    C('The spine breaks. Paralysed below the wound.', { helpless: true, lost: 'use of the legs' }),
    C('The chest is crushed flat.', { dead: true })
  ],
  arm: [
    C('Arm bruised.', { fatigue: 1 }),
    C('The hand takes the blow.', { drop: true }),
    C('The arm goes numb.', { mods: { arm: -10 }, disabled: '1d5 rounds' }),
    C('Fingers broken.', { drop: true, mods: { arm: -10 }, until: 'healed' }),
    C('The forearm breaks.', { fatigue: 2, disabled: 'until healed' }),
    C('The elbow shatters. Surgery or nothing.', { drop: true, stun: '1', disabled: 'until surgery' }),
    C('The upper arm shatters.', { mods: { arm: -20 }, blood: true }),
    C('The shoulder is destroyed.', { stun: '1d5', blood: true, disabled: 'until surgery' }),
    C('The arm is pulped past saving.', { lost: 'arm', helpless: '1d5 rounds', blood: true }),
    C('The blow carries through the arm into the chest.', { dead: true })
  ],
  leg: [
    C('Leg bruised.', { fatigue: 1 }),
    C('The foot takes the blow.', { fatigue: 1, slow: 'half Movement this round' }),
    C('The knee jars.', { prone: true }),
    C('Toes broken.', { slow: 'Movement halved until healed' }),
    C('The shin breaks.', { prone: true, fatigue: 2, slow: 'Movement halved' }),
    C('The knee shatters.', { prone: true, stun: '1', slow: 'Movement permanently halved' }),
    C('The femur breaks.', { prone: true, helpless: '1d5 rounds', blood: true }),
    C('The hip is destroyed. No walking without help.', { blood: true, slow: 'cannot walk unaided' }),
    C('The leg is pulped.', { lost: 'leg', helpless: true, blood: true }),
    C('The blow travels up the body and stops the heart.', { dead: true })
  ]
};

const RENDING = {
  head: [
    C('Scalp cut. Bleeds like a scalp wound does.', { fatigue: 1, blood: true }),
    C('Cheek laid open.', { blood: true, mods: { fel: -10 }, until: 'healed' }),
    C('An ear comes off.', { lost: 'an ear', blood: true }),
    C('A cut across the brow fills the eyes with blood.', { blind: '1d5 rounds', blood: true }),
    C('The face opens to the bone.', { stun: '1d5', blood: true, mods: { fel: -20 } }),
    C('An eye is cut out.', { lost: 'an eye', stun: '1', blood: true }),
    C('The throat opens. No speech, and not much time.', { mute: true, blood: true, fatigue: 3 }),
    C('The skull opens.', { stun: '1d10', mods: { int: -10 }, blood: true }),
    C('The throat is cut through. Dies in 1d5 rounds without Medicae.', { helpless: true, blood: true, dying: '1d5 rounds' }),
    C('The head comes off.', { dead: true })
  ],
  body: [
    C('A shallow cut.', { fatigue: 1 }),
    C('A gash across the ribs.', { blood: true }),
    C('A deep cut.', { fatigue: 1, blood: true, mods: { ag: -10 }, until: 'healed' }),
    C('Muscle severed.', { fatigue: 2, blood: true }),
    C('The belly opens.', { stun: '1', blood: true, mods: { t: -10 }, until: 'healed' }),
    C('An artery is cut.', { blood: true, fatigue: 3, stun: '1d5' }),
    C('Organs sliced.', { helpless: '1d5 rounds', blood: true }),
    C('The torso is laid open. Dies in 1d10 rounds without Medicae.', { helpless: true, blood: true, dying: '1d10 rounds' }),
    C('The spine is severed. Paralysed below the wound.', { helpless: true, lost: 'use of the legs' }),
    C('Cut in half.', { dead: true })
  ],
  arm: [
    C('The arm is cut.', { fatigue: 1 }),
    C('The hand is cut open.', { drop: true, blood: true }),
    C('Fingers come off — 1d5 of them.', { lost: '1d5 fingers', blood: true, drop: true }),
    C('A tendon is cut.', { mods: { arm: -20 }, until: 'healed' }),
    C('A deep cut to the forearm.', { blood: true, disabled: 'until healed' }),
    C('The hand is severed.', { lost: 'hand', drop: true, blood: true }),
    C('The arm is cut to the bone.', { stun: '1', blood: true, disabled: 'until surgery' }),
    C('The arm is severed at the elbow.', { lost: 'arm', blood: true, fatigue: 3 }),
    C('The arm is severed at the shoulder.', { lost: 'arm', helpless: true, blood: true }),
    C('The cut carries through the arm into the chest.', { dead: true })
  ],
  leg: [
    C('The leg is cut.', { fatigue: 1 }),
    C('The calf is cut.', { blood: true, slow: 'half Movement this round' }),
    C('Toes come off — 1d5 of them.', { lost: '1d5 toes', blood: true }),
    C('The hamstring is cut.', { prone: true, slow: 'Movement halved until healed' }),
    C('A deep cut to the thigh.', { blood: true, prone: true, fatigue: 2 }),
    C('The foot is severed.', { lost: 'foot', prone: true, blood: true }),
    C('The knee is cut apart.', { stun: '1', blood: true, slow: 'Movement permanently halved' }),
    C('The leg is severed at the knee.', { lost: 'leg', helpless: '1d5 rounds', blood: true }),
    C('The leg is severed at the hip.', { lost: 'leg', helpless: true, blood: true }),
    C('Opened from groin to sternum.', { dead: true })
  ]
};

const EXPLOSIVE = {
  head: [
    C('The blast wave rattles the skull.', { fatigue: 1 }),
    C('Shrapnel across the face.', { blood: true, mods: { fel: -10 }, until: 'healed' }),
    C('Eardrums burst.', { fatigue: 1, deaf: '1d10 hours' }),
    C('The flash blinds.', { blind: '1d5 rounds', stun: '1' }),
    C('Concussion and shrapnel together.', { stun: '1d10', fatigue: 2, blood: true }),
    C('An eye is destroyed.', { lost: 'an eye', stun: '1d5', blood: true }),
    C('The jaw is blown away.', { mute: true, stun: '1d10', blood: true }),
    C('The skull fractures open.', { helpless: true, mods: { int: -10 }, blood: true }),
    C('The face is destroyed. Dies in 1d5 rounds without Medicae.', { helpless: true, blood: true, dying: '1d5 rounds' }),
    C('The head is blown apart.', { dead: true })
  ],
  body: [
    C('The blast staggers the target.', { fatigue: 1 }),
    C('Shrapnel peppers the torso.', { blood: true }),
    C('Blown off the feet.', { prone: true, fatigue: 1 }),
    C('Shrapnel in the gut.', { fatigue: 2, blood: true }),
    C('The blast crushes the chest.', { stun: '1d5', prone: true, mods: { t: -10 }, until: 'healed' }),
    C('Carried gear ignites.', { fire: true, prone: true, fatigue: 2 }),
    C('The abdomen tears open.', { helpless: '1d5 rounds', blood: true }),
    C('The ribs are blown inward. Dies in 1d10 rounds without Medicae.', { helpless: true, blood: true, dying: '1d10 rounds' }),
    C('The torso is torn apart. The target may act until the end of the round, then dies.', { dead: true, delay: 'end of the round' }),
    C('Blown to pieces.', { dead: true })
  ],
  arm: [
    C('The blast burns and bruises the arm.', { fatigue: 1 }),
    C('Shrapnel through the hand.', { drop: true, blood: true }),
    C('The arm is peppered.', { mods: { arm: -10 }, blood: true, until: 'healed' }),
    C('Fingers blown off — 1d5 of them.', { lost: '1d5 fingers', blood: true, drop: true }),
    C('The forearm is mangled.', { blood: true, disabled: 'until surgery' }),
    C('The hand is blown off.', { lost: 'hand', stun: '1', blood: true }),
    C('The arm is shattered and burning.', { fire: true, blood: true, disabled: 'until surgery' }),
    C('The arm is blown off at the elbow.', { lost: 'arm', stun: '1d5', blood: true }),
    C('The arm is blown off at the shoulder.', { lost: 'arm', helpless: true, blood: true }),
    C('The blast tears through the arm into the chest.', { dead: true })
  ],
  leg: [
    C('The blast scorches the leg.', { fatigue: 1 }),
    C('Shrapnel in the calf.', { blood: true, slow: 'half Movement this round' }),
    C('Knocked off the feet.', { prone: true, fatigue: 1 }),
    C('Toes blown off — 1d5 of them.', { lost: '1d5 toes', slow: 'Movement halved until healed' }),
    C('The thigh is mangled.', { prone: true, blood: true, fatigue: 2 }),
    C('The foot is blown off.', { lost: 'foot', prone: true, blood: true }),
    C('The knee is destroyed.', { stun: '1', blood: true, slow: 'Movement permanently halved' }),
    C('The leg is blown off below the knee.', { lost: 'leg', helpless: '1d5 rounds', blood: true }),
    C('The leg is blown off at the hip.', { lost: 'leg', helpless: true, blood: true }),
    C('The blast travels up through the body.', { dead: true })
  ]
};

const TABLES = { energy: ENERGY, impact: IMPACT, rending: RENDING, explosive: EXPLOSIVE };

export const CRIT_MAX = 10;

// One row. Levels above 10 read as 10 — the table's last row is already death
// for every location, so there is nothing beyond it to look up.
export function critRow(type, location, level) {
  const t = damageTypeById(type);
  const loc = locationById(location);
  const n = Math.min(CRIT_MAX, Math.max(1, Math.floor(Number(level) || 0)));
  if (!t || !loc || !level) return null;
  const table = TABLES[t.id][loc.group];
  return { ...table[n - 1], level: n, type: t.id, location: loc.id, locationName: loc.name };
}

// Every row from `from` up to `to`, because critical damage applies each row
// it passes through. `from` lets a second hit skip rows the first already did.
export function critRows(type, location, to, from = 1) {
  const top = Math.min(CRIT_MAX, Math.floor(Number(to) || 0));
  const out = [];
  for (let n = Math.max(1, from); n <= top; n++) {
    const row = critRow(type, location, n);
    if (row) out.push(row);
  }
  return out;
}

/* ------------------------------ what it adds up to ------------------------------ */

// Rolls the rows into one state a sheet can show: total Fatigue, whether the
// target is dead, and the lasting effects worth carrying to the next scene.
export function summarise(rows) {
  const list = rows || [];
  const conditions = [];
  const add = (s) => { if (s && !conditions.includes(s)) conditions.push(s); };
  let fatigue = 0;
  const mods = {};
  const lost = [];

  for (const r of list) {
    fatigue += Number(r.fatigue) || 0;
    if (r.stun) add(`Stunned ${r.stun} round${r.stun === '1' ? '' : 's'}`);
    if (r.prone) add('Prone');
    if (r.blood) add('Blood Loss');
    if (r.fire) add('On Fire');
    if (r.helpless) add(r.helpless === true ? 'Helpless' : `Helpless ${r.helpless}`);
    if (r.blind) add(`Blinded ${r.blind}`);
    if (r.deaf) add(`Deafened ${r.deaf}`);
    if (r.mute) add('Cannot speak');
    if (r.drop) add('Drops what the hand holds');
    if (r.slow) add(r.slow);
    if (r.disabled) add(`Limb unusable ${r.disabled}`);
    if (r.dying) add(`Dies in ${r.dying} without Medicae`);
    if (r.lost) lost.push(r.lost);
    for (const [k, v] of Object.entries(r.mods || {})) mods[k] = (mods[k] || 0) + v;
  }

  const killer = list.find((r) => r.dead);
  return {
    fatigue,
    conditions,
    mods,
    lost,
    dead: Boolean(killer),
    delay: killer ? killer.delay || null : null
  };
}

/* ------------------------------ resolving a hit ------------------------------
   Soak is armour reduced by the weapon's Penetration, then Toughness Bonus,
   both off each hit. What runs past the remaining Wounds is critical damage,
   and it stacks on whatever critical damage the target already carries. */

export function resolveHit({
  damage = 0, penetration = 0, armour = 0, toughnessBonus = 0,
  wounds = 0, critSoFar = 0, type = 'impact', location = 'body',
  fury = null                       // { confirmed, d5 } from Righteous Fury
} = {}) {
  const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
  const effectiveArmour = Math.max(0, n(armour) - n(penetration));
  const soak = effectiveArmour + n(toughnessBonus);
  const taken = Math.max(0, n(damage) - soak);
  const left = n(wounds);

  const woundsLost = Math.min(left, taken);
  const overflow = taken - woundsLost;
  const before = n(critSoFar);
  const critTotal = before + overflow;

  // Rows the target has not already suffered. A first hit that overflows by 5
  // does 1 to 5; the next overflow of 2 does 6 and 7.
  const rows = overflow > 0 ? critRows(type, location, critTotal, before + 1) : [];

  const furyLevel = fury && fury.confirmed ? Math.max(1, Math.min(5, n(fury.d5))) : 0;
  const furyRows = furyLevel ? critRows(type, location, furyLevel) : [];

  const all = [...rows, ...furyRows];
  return {
    soak,
    taken,
    woundsLost,
    woundsLeft: left - woundsLost,
    overflow,
    critTotal,
    rows,
    furyRows,
    summary: summarise(all),
    dying: critTotal > 0 || furyLevel > 0
  };
}

// Righteous Fury: a natural 10 on a damage die earns another attack roll, and
// only if that one hits does the table come out. Kept separate from the die
// roll itself so the sheet can ask for the confirmation roll.
export const furyTriggered = (damageDice) =>
  (damageDice || []).some((d) => Number(d) === 10);
