// Awareness: what a character could know. Surprise, unaware targets, noise
// and obscured sight, for the projected battle map's hidden/ping/seen contacts.
//
// WHAT IS ROGUE TRADER AND WHAT IS HOUSE
//
//   RT (p.235, 249): a Surprised combatant loses his first Turn and every
//   attacker gets +30 to WS/BS Tests against him; an Unaware target is hit at
//   +30 (Easy). Fog, mist, shadow and smoke make a Ballistic Skill Test
//   Hard (-20); harsh weather is Hard (-20). Hiding is Concealment, creeping
//   is Silent Move, and wary opponents oppose either with an Awareness Test.
//
//   HOUSE (borrowed from Inquisitor's hearing and vision idea): how far a
//   noise carries, and how far sight reaches into foliage or smoke. RT has no
//   numbers for either, so these are plain tables the GM can edit.

import { resolveTest } from './dice.js';
import { readMap, parseKey } from './battlemap.js';

/* ------------------------------ surprise ------------------------------ */

export const SURPRISE = Object.freeze({ attackBonus: 30, losesFirstTurn: true });

// Situation ids (groundcombat.js SITUATION_MODIFIERS) a map's conditions imply.
export const LIGHTING_PRESETS = [
  { id: 'clear', name: 'Clear', situationIds: [] },
  { id: 'dim', name: 'Fog, Mist or Shadow', situationIds: ['poor_visibility'] },
  { id: 'smoke', name: 'Smoke', situationIds: ['poor_visibility'] },
  { id: 'rain', name: 'Rain or Ash Storm', situationIds: ['bad_weather'] },
  { id: 'dark', name: 'Total Darkness', situationIds: ['total_darkness'] }
];
export const lightingById = (id) => LIGHTING_PRESETS.find((p) => p.id === id) || LIGHTING_PRESETS[0];

/* ------------------------------ opposed Awareness ------------------------------ */

// Hider rolls Concealment or Silent Move; the watcher opposes with Awareness.
// Both succeed: more Degrees wins. One succeeds: that one wins. Neither: the
// hider stays unseen. A tie on Degrees goes to `tieGoesTo` — RT leaves it to
// the GM, and the hider is the safer default for a map that must not leak.
export function opposedAwareness({ awareness = 0, awarenessRoll, hiding = 0, hidingRoll, tieGoesTo = 'hider', mod = 0 } = {}) {
  const watch = resolveTest(Number(awareness) || 0, Number(mod) || 0, awarenessRoll);
  const hide = resolveTest(Number(hiding) || 0, 0, hidingRoll);
  let spotted;
  if (watch.success && hide.success) {
    spotted = watch.degrees > hide.degrees || (watch.degrees === hide.degrees && tieGoesTo === 'watcher');
  } else {
    spotted = watch.success;
  }
  return { spotted, watch, hide };
}

/* ------------------------------ noise (house) ------------------------------ */

export const NOISE = [
  { id: 'whisper', name: 'Whisper', radiusM: 3 },
  { id: 'footsteps', name: 'Footsteps', radiusM: 8 },
  { id: 'door', name: 'Opening a door', radiusM: 12 },
  { id: 'melee', name: 'Melee', radiusM: 20 },
  { id: 'silenced', name: 'Silenced shot', radiusM: 25 },
  { id: 'shot', name: 'Gunshot', radiusM: 60 },
  { id: 'explosion', name: 'Explosion', radiusM: 120 }
];
export const noiseById = (id) => NOISE.find((n) => n.id === id) || null;

// Everything hidden inside the noise's radius becomes a ping: the party hears
// something there without learning what. What they have already seen stays
// seen, and a ping stays a ping — a sound does not un-reveal a thing.
// Same contract as battlemap.js's auspexSweep, with a radius from what made
// the noise rather than from a sensor.
export function noisePing(map, from, kindId) {
  const m = readMap(map);
  const noise = noiseById(kindId);
  if (!from || !noise) return m.contacts;
  const reach = noise.radiusM / (m.metresPerSquare || 1);
  const out = {};
  for (const [k, c] of Object.entries(m.contacts)) {
    const p = parseKey(k);
    if (!p) continue;
    const near = Math.hypot(p.x - from.x, p.y - from.y) <= reach;
    out[k] = near && c.state === 'hidden' ? { ...c, state: 'ping' } : c;
  }
  return out;
}

/* ------------------------------ obscuring terrain (house) ------------------------------ */

// Sight carries this far INTO foliage or smoke before it stops dead.
export const OBSCURING = [
  { id: 'light', name: 'Light foliage / thin smoke', blocksAfterM: 7 },
  { id: 'medium', name: 'Medium foliage / smoke', blocksAfterM: 5 },
  { id: 'heavy', name: 'Dense foliage / thick smoke', blocksAfterM: 4 }
];
export const obscuringById = (id) => OBSCURING.find((o) => o.id === id) || null;

// `metresThrough` is how much of the line of sight passes through the stuff.
export function sightBlockedByObscuring(metresThrough, densityId) {
  const o = obscuringById(densityId);
  return Boolean(o) && (Number(metresThrough) || 0) > o.blocksAfterM;
}
