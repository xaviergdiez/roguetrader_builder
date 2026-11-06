/* THE END OF A TURN ON THE VOID CHART, and the traps laid on it.

   When a turn of void combat ends (the last phase wraps round), the chart moves
   on with it:

     1. Riptides carry the ships inside them (voidmap.js, applyDrift).
     2. Everything with a COURSE moves along it: a swarm of rocks, a spreading
        debris field, a hulk adrift (voidmap.js, readCourse).
     3. A mover with a STRIKE hits every ship it passed over on the way, which
        is how a ship that sat still in a swarm's path pays for it.
     4. The turn count goes up, and turn triggers due at the end of it go off.

   Dice are not rolled here; a strike is handed back as its dice and the
   caller rolls them (rollStrike takes the random source, so a check can hold
   it still). A void trigger set off by a ship being moved is springVoidEnter.

   Pure: see voidturn.check.mjs. */

import { readVoidMap, applyDrift, segDist, readStrike } from './voidmap.js';

// How close to a ship's centre a mover must pass to hit it: about the size of
// a hull on the chart.
export const SHIP_PAD = 0.5;
const round2 = (n) => Math.round(n * 100) / 100 + 0;

// A field or a body moved k turns along its course.
export function moveAlong(thing, k = 1) {
  const c = thing && thing.course;
  if (!c) return thing;
  const dx = round2(c[0] * k), dy = round2(c[1] * k);
  const out = { ...thing, x: round2(thing.x + dx), y: round2(thing.y + dy) };
  if (thing.shape === 'band') { out.x2 = round2(thing.x2 + dx); out.y2 = round2(thing.y2 + dy); }
  return out;
}

// Is a point inside a mover, padded by a hull's size?
function covers(thing, p, pad) {
  if (thing.shape === 'band') {
    return segDist(p, { x: thing.x, y: thing.y }, { x: thing.x2, y: thing.y2 }) <= thing.w / 2 + pad;
  }
  return Math.hypot(p.x - thing.x, p.y - thing.y) <= (thing.r || 0) + pad;
}

/* Did a mover pass over a point on its way from `before` to `after`? Walked
   in steps no longer than half a VU, so a fast rock cannot jump a ship. A
   ship it STARTS on is passed over too: a swarm that sweeps on leaves wreckage
   behind it. */
export function sweeps(before, after, p, pad = SHIP_PAD) {
  const dist = Math.hypot(after.x - before.x, after.y - before.y);
  const steps = Math.max(1, Math.ceil(dist / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const at = { ...after, x: before.x + (after.x - before.x) * t, y: before.y + (after.y - before.y) * t };
    if (after.shape === 'band') {
      at.x2 = before.x2 + (after.x2 - before.x2) * t;
      at.y2 = before.y2 + (after.y2 - before.y2) * t;
    }
    if (covers(at, p, pad)) return true;
  }
  return false;
}

// Everything on the chart that moves by itself.
export const moversOf = (m) => [
  ...m.fields.filter((f) => f.course).map((f) => ({ type: 'field', thing: f })),
  ...m.bodies.filter((b) => b.course).map((b) => ({ type: 'body', thing: b }))
];

/* Where each mover will be over the next few turns, for the ghosts the chart
   draws ahead of it. */
export const courseAhead = (thing, turns = 3) =>
  Array.from({ length: Math.max(0, turns) }, (_, i) => moveAlong(thing, i + 1));

/* The ships a mover would hit if they held still, and in how many turns: what
   the table is warned of. The first turn each ship would be struck, by what. */
export function strikesAhead(map, turns = 3) {
  const m = readVoidMap(map);
  const out = [];
  for (const s of m.ships) {
    let found = null;
    for (const { thing } of moversOf(m)) {
      if (!thing.strike) continue;
      for (let k = 1; k <= turns; k++) {
        if (sweeps(moveAlong(thing, k - 1), moveAlong(thing, k), s)) {
          if (!found || k < found.inTurns) found = { shipId: s.id, name: s.name, inTurns: k, by: thing.name };
          break;
        }
      }
    }
    if (found) out.push(found);
  }
  return out;
}

/* ------------------------------ void triggers ------------------------------ */

const insideZone = (t, p) => Math.hypot(p.x - t.x, p.y - t.y) <= t.r;
export const shipsInZone = (m, t) => m.ships.filter((s) => t.sides.includes(s.side) && insideZone(t, s));

// One trigger's effects on the chart: what it reveals, and spent unless it repeats.
export function fireVoidTrigger(map, t) {
  const m = readVoidMap(map);
  let out = m;
  if (t.reveal) {
    const seen = (x) => (insideZone(t, x) ? { ...x, state: 'seen' } : x);
    out = { ...out, ships: out.ships.map(seen), bodies: out.bodies.map(seen), fields: out.fields.map(seen) };
  }
  if (t.once) out = { ...out, triggers: out.triggers.map((x) => (x.id === t.id ? { ...x, armed: false } : x)) };
  return readVoidMap(out);
}

// What the caller is told of a trigger that went off, and who was in it.
const told = (t, ships) => ({
  id: t.id, name: t.name, note: t.note, cue: t.cue, handout: t.handout, strike: t.strike,
  shipIds: ships.map((s) => s.id), shipNames: ships.map((s) => s.name)
});

/* A change to the chart that moved a ship into a zone watching for its side.
   A ship counts as entering when it is inside now and was not before (or was
   not on the chart at all). */
export function springVoidEnter(prevMap, nextMap) {
  const next = readVoidMap(nextMap);
  if (!next.triggers.some((t) => t.armed && t.when === 'enter')) return { map: next, fired: [] };
  const prev = readVoidMap(prevMap);
  let m = next;
  const fired = [];
  for (const t of next.triggers) {
    if (!t.armed || t.when !== 'enter') continue;
    const was = new Set(shipsInZone(prev, t).map((s) => s.id));
    const now = shipsInZone(next, t);
    if (!now.some((s) => !was.has(s.id))) continue;
    m = fireVoidTrigger(m, t);
    fired.push(told(t, now));
  }
  return { map: m, fired };
}

export const springVoidNow = (map, t) => {
  const m = readVoidMap(map);
  return { map: fireVoidTrigger(m, t), fired: [told(t, shipsInZone(m, t))] };
};

/* ------------------------------ the turn ends ------------------------------ */

export function endVoidTurn(map) {
  const m0 = readVoidMap(map);
  const { map: m1, moved: drifted } = applyDrift(m0);
  const moved = [];
  const struck = [];
  const step = (thing, type) => {
    if (!thing.course) return thing;
    const after = moveAlong(thing, 1);
    moved.push({ type, id: thing.id, name: thing.name });
    if (thing.strike) {
      for (const s of m1.ships) {
        if (sweeps(thing, after, s)) struck.push({ shipId: s.id, name: s.name, by: thing.name, strike: thing.strike });
      }
    }
    return after;
  };
  let m2 = readVoidMap({
    ...m1,
    fields: m1.fields.map((f) => step(f, 'field')),
    bodies: m1.bodies.map((b) => step(b, 'body')),
    turn: m0.turn + 1
  });
  const fired = [];
  for (const t of m2.triggers) {
    if (!t.armed || t.when !== 'turn' || !(t.turn === 0 || t.turn === m2.turn)) continue;
    const ships = shipsInZone(m2, t);
    m2 = fireVoidTrigger(m2, t);
    fired.push(told(t, ships));
  }
  return { map: m2, drifted, moved, struck, fired };
}

/* ------------------------------ the dice ------------------------------ */

export const strikeText = (s) => {
  const k = readStrike(s);
  if (!k) return '';
  return `${k.n}d${k.d}${k.bonus ? `+${k.bonus}` : ''}${k.armour ? '' : ', ignoring armour'}`;
};

export function rollStrike(s, rng = Math.random) {
  const k = readStrike(s);
  if (!k) return null;
  const rolls = Array.from({ length: k.n }, () => 1 + Math.floor(rng() * k.d));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + k.bonus, armour: k.armour, text: strikeText(k) };
}
