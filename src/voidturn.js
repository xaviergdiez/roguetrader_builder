/* THE END OF A TURN ON THE VOID CHART, and the traps laid on it.

   When a turn of void combat ends (the last phase wraps round), the chart moves
   on with it:

     1. Riptides carry the ships inside them (voidmap.js, applyDrift).
     2. Everything with a COURSE moves along it: a swarm of rocks, a spreading
        debris field, a hulk adrift (voidmap.js, readCourse). Everything with
        an ORBIT goes round its centre: the worlds round the star, a moon round
        its planet, carried along as the planet goes (readOrbit).
     3. A mover with a STRIKE hits every ship it passed over on the way, which
        is how a ship that sat still in a swarm's path pays for it. A field
        that stays where it is but has a strike (a warp rift, a radiation
        zone) burns every ship inside it.
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
  ...m.fields.filter((f) => f.course || f.orbit).map((f) => ({ type: 'field', thing: f })),
  ...m.bodies.filter((b) => b.course || b.orbit).map((b) => ({ type: 'body', thing: b }))
];

// A point turned `deg` degrees about a centre, clockwise on the chart.
const turnAbout = (p, c, deg) => {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: round2(c.x + dx * Math.cos(r) - dy * Math.sin(r)), y: round2(c.y + dx * Math.sin(r) + dy * Math.cos(r)) };
};

/* One turn's motion for everything that moves: a course carried out, an
   orbit gone round. A body circling another is worked out after the one it
   circles, so a moon keeps its place beside a planet that has moved; a loop
   of bodies circling each other is broken by leaving the second where it is. */
export function stepAll(m) {
  const before = new Map(m.bodies.map((b) => [b.id, b]));
  const after = new Map();
  const busy = new Set();
  const centreOf = (o) => {
    if (o.parent && before.has(o.parent)) {
      const now = bodyAfter(o.parent);
      return now ? { c0: before.get(o.parent), c1: now } : null;
    }
    return { c0: { x: o.cx, y: o.cy }, c1: { x: o.cx, y: o.cy } };
  };
  const orbitStep = (thing) => {
    const c = centreOf(thing.orbit);
    if (!c) return thing;
    const turned = turnAbout(thing, c.c0, thing.orbit.rate);
    return { ...thing, x: round2(turned.x + c.c1.x - c.c0.x), y: round2(turned.y + c.c1.y - c.c0.y) };
  };
  function bodyAfter(id) {
    if (after.has(id)) return after.get(id);
    if (busy.has(id)) return null;
    busy.add(id);
    const b = before.get(id);
    const next = b.orbit ? orbitStep(b) : b.course ? moveAlong(b, 1) : b;
    busy.delete(id);
    after.set(id, next);
    return next;
  }
  const bodies = m.bodies.map((b) => bodyAfter(b.id) || b);
  const fields = m.fields.map((f) => (f.orbit ? orbitStep(f) : f.course ? moveAlong(f, 1) : f));
  return { bodies, fields };
}

/* Where everything that moves will be over the next few turns: for each,
   keyed 'body:id' or 'field:id', its places after one turn, two, three. What
   the chart draws ahead of each mover, and what the warnings are read from. */
export function motionAhead(map, turns = 3) {
  let m = readVoidMap(map);
  const out = new Map();
  for (const { type, thing } of moversOf(m)) out.set(`${type}:${thing.id}`, []);
  for (let k = 0; k < turns; k++) {
    const next = stepAll(m);
    for (const b of next.bodies) if (out.has(`body:${b.id}`)) out.get(`body:${b.id}`).push(b);
    for (const f of next.fields) if (out.has(`field:${f.id}`)) out.get(`field:${f.id}`).push(f);
    m = { ...m, ...next };
  }
  return out;
}

/* Where each mover will be over the next few turns, for the ghosts the chart
   draws ahead of it. */
export const courseAhead = (thing, turns = 3) =>
  Array.from({ length: Math.max(0, turns) }, (_, i) => moveAlong(thing, i + 1));

/* The ships a mover would hit if they held still, and in how many turns: what
   the table is warned of. The first turn each ship would be struck, by what. */
export function strikesAhead(map, turns = 3) {
  const m = readVoidMap(map);
  const ahead = motionAhead(m, turns);
  const out = [];
  for (const s of m.ships) {
    let found = null;
    for (const { type, thing } of moversOf(m)) {
      if (!thing.strike) continue;
      const path = [thing, ...(ahead.get(`${type}:${thing.id}`) || [])];
      for (let k = 1; k < path.length; k++) {
        if (sweeps(path[k - 1], path[k], s)) {
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
  const next = stepAll(m1);
  const step = (thing, type, after) => {
    if (!thing.course && !thing.orbit) return thing;
    moved.push({ type, id: thing.id, name: thing.name });
    if (thing.strike) {
      for (const s of m1.ships) {
        if (sweeps(thing, after, s)) struck.push({ shipId: s.id, name: s.name, by: thing.name, strike: thing.strike });
      }
    }
    return after;
  };
  // What stays put and burns: every ship inside it, once a turn.
  for (const f of m1.fields) {
    if (f.course || f.orbit || !f.strike) continue;
    for (const s of m1.ships) {
      if (covers(f, s, 0)) struck.push({ shipId: s.id, name: s.name, by: f.name, strike: f.strike, inside: true });
    }
  }
  let m2 = readVoidMap({
    ...m1,
    fields: m1.fields.map((f, i) => step(f, 'field', next.fields[i])),
    bodies: m1.bodies.map((b, i) => step(b, 'body', next.bodies[i])),
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

/* A course from a heading and a speed: degrees clockwise from the top of the
   chart, and VU a turn. The way a torpedo is aimed. */
export function courseFrom(heading, speed) {
  const a = ((Number(heading) || 0) * Math.PI) / 180;
  const v = Number(speed) || 0;
  return [round2(Math.sin(a) * v), round2(-Math.cos(a) * v)];
}

// And back: the heading and speed a course comes to.
export function headingOf(course) {
  if (!course) return { heading: 0, speed: 0 };
  const speed = round2(Math.hypot(course[0], course[1]));
  const heading = Math.round(((Math.atan2(course[0], -course[1]) * 180) / Math.PI + 360) % 360);
  return { heading, speed };
}

/* Every world set going round: planets and gas giants round the star (the
   nearer, the faster, as a world's year is shorter nearer its sun), moons
   round the nearest planet or giant. A world that already has an orbit keeps
   it. With no star on the chart, round the chart's middle. */
export function orbitAll(map) {
  const m = readVoidMap(map);
  const star = m.stars[0] || { x: m.cols / 2, y: m.rows / 2 };
  const worlds = m.bodies.filter((b) => b.kind === 'planet' || b.kind === 'gas_giant');
  const bodies = m.bodies.map((b) => {
    if (b.orbit) return b;
    if (b.kind === 'planet' || b.kind === 'gas_giant') {
      const d = Math.max(1, Math.hypot(b.x - star.x, b.y - star.y));
      return { ...b, orbit: { rate: Math.round(Math.min(8, Math.max(1, 160 / d)) * 10) / 10, parent: '', cx: star.x, cy: star.y } };
    }
    if (b.kind === 'moon' && worlds.length) {
      const host = worlds.reduce((best, w) => (Math.hypot(w.x - b.x, w.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? w : best));
      return { ...b, orbit: { rate: 15, parent: host.id, cx: host.x, cy: host.y } };
    }
    return b;
  });
  return readVoidMap({ ...m, bodies });
}
