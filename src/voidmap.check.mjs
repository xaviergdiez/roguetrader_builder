// Self-check for the void map. Run: node src/voidmap.check.mjs
import assert from 'node:assert/strict';
import { makeRng } from './mapgen.js';
import { rollSystem } from './stargen.js';
import {
  VOID_SIZES, sizeById, readVoidMap, newVoidMap, buildScene, chartableElements, elementLabel,
  distanceVU, segDist, inField, chordLength, silhouetteBehind, reach, moveCheck, driftAt, applyDrift,
  placeShips, pruneShips, moveShip, turnShip, bearing, snapToSquare, clearSpace,
  redactVoidForTable, voidForBridge, voidForTable, describeScene, combatForBridge,
  FIELD_KINDS, BODY_KINDS, TERRAIN_FLOOR, MAX_VOID, MIN_VOID,
  ARC_DEFAULTS, ARC_SLOTS, MIN_ARC, angleDiff, inArc, arcWedges, weaponsBearing,
  rotatePoint, rotateThing, rotateScene, clearChart, removeThing,
  togglePins, togglePin, isPinned, overlayWedges, MAX_OVERLAYS,
  MAX_SAVED_CHARTS, MAX_LIBRARY_BYTES, readSavedChart, readVoidLibrary, libraryBytes, chartSummary,
  saveChart, deleteChart, sameChart
} from './voidmap.js';
import { rangeBand } from './voidcombat.js';

const near = (a, b, eps = 0.15) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

/* ---- reading a map: nothing is trusted ---- */
{
  const m = readVoidMap({
    cols: 9999, rows: 2, name: '  '.padEnd(500, 'x'),
    bodies: [{ kind: 'planet', x: 5, y: 5, r: 99999 }, { kind: 'wormhole' }, null, 'x'],
    fields: [{ kind: 'dust_cloud', r: -4 }, { kind: 'nonsense' }],
    ships: [{ id: 'a', heading: -90, side: 'pirate', x: 'x' }, { name: 'no id' }],
    stars: [{ typeId: 'nova', r: 0 }]
  });
  assert.equal(m.cols, MAX_VOID, 'a huge grid is clamped');
  assert.equal(m.rows, MIN_VOID, 'and a tiny one');
  assert.ok(m.name.length <= 80);
  assert.equal(m.bodies.length, 1, 'an unknown body kind and junk are dropped');
  assert.ok(m.bodies[0].r <= 60, 'a body cannot be bigger than the sky');
  assert.equal(m.fields.length, 1);
  assert.ok(m.fields[0].r >= 0.5, 'a field has a radius');
  assert.equal(m.ships.length, 1, 'a ship needs an id');
  assert.equal(m.ships[0].heading, 270, '-90 reads as 270');
  assert.equal(m.ships[0].side, 'neutral', 'an unknown side is neutral');
  assert.equal(m.ships[0].x, 0, 'a non-number position is 0');
  assert.equal(m.stars[0].typeId, 'vigorous', 'an unknown star type reads as the default');
  assert.deepEqual(readVoidMap(readVoidMap(m)), readVoidMap(m), 'reading is idempotent');
  assert.equal(readVoidMap(null).cols, 64);
  assert.equal(newVoidMap('x', 'fleet').cols, 140);
  assert.equal(sizeById('nope').id, 'standard');
}

/* ---- geometry ---- */
{
  assert.equal(distanceVU({ x: 3.5, y: 5.5 }, { x: 6.5, y: 5.5 }), 3, 'three squares apart is three VU');
  assert.equal(distanceVU({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  near(segDist({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  near(segDist({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5, 0.01);
  assert.equal(segDist({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5, 'a zero-length segment is a point');

  const cloud = { shape: 'circle', x: 10, y: 0, r: 5 };
  assert.ok(inField(cloud, { x: 12, y: 1 }));
  assert.ok(!inField(cloud, { x: 20, y: 0 }));
  near(chordLength(cloud, { x: 0, y: 0 }, { x: 20, y: 0 }), 10, 0.3);
  near(chordLength(cloud, { x: 0, y: 8 }, { x: 20, y: 8 }), 0, 0.01);
  near(chordLength(cloud, { x: 0, y: 3 }, { x: 20, y: 3 }), 8, 0.3);

  const belt = { shape: 'band', x: 0, y: 10, x2: 40, y2: 10, w: 8 };
  assert.ok(inField(belt, { x: 20, y: 13 }));
  assert.ok(!inField(belt, { x: 20, y: 15 }));
  near(chordLength(belt, { x: 20, y: 0 }, { x: 20, y: 20 }), 8, 0.3);
}

/* ---- a hand-built scene ---- */
const scene = () => readVoidMap({
  cols: 40, rows: 28,
  bodies: [
    { id: 'p', kind: 'planet', name: 'Planet', x: 20, y: 14, r: 3 },
    { id: 'st', kind: 'station', name: 'Station', x: 30, y: 6, r: 2 }
  ],
  fields: [
    { id: 'd1', kind: 'dust_cloud', name: 'Dust Cloud', shape: 'circle', x: 10, y: 6.5, r: 3 },
    { id: 'rt', kind: 'gravity_riptide', name: 'Riptide', shape: 'band', x: 0, y: 24, x2: 40, y2: 24, w: 6, drift: [2, 0] },
    { id: 'ab', kind: 'asteroid_cluster', name: 'Cluster', shape: 'circle', x: 30, y: 20, r: 3 }
  ],
  stars: [{ typeId: 'vigorous', x: 20, y: -30, r: 6 }],
  ships: [
    { id: 'a', name: 'Alpha', side: 'player', x: 3.5, y: 6.5 },
    { id: 'b', name: 'Bravo', side: 'enemy', x: 16.5, y: 6.5 },
    { id: 'c', name: 'Charlie', side: 'enemy', x: 36.5, y: 14.5 },
    { id: 'd', name: 'Delta', side: 'enemy', x: 3.5, y: 14.5 },
    { id: 'e', name: 'Echo', side: 'player', x: 12.5, y: 24.5 }
  ]
});

/* ---- distance, range band, terrain, blocking ---- */
{
  const m = scene();
  const r = reach(m, 'a', 'b', { weaponRange: 20 });
  assert.equal(r.distance, 13);
  assert.equal(r.band, rangeBand(13, 20), 'the band is voidcombat.js\'s own');
  assert.equal(r.band, 'standard');
  assert.ok(r.canFire);
  assert.equal(r.blocked, null);
  // The shot from (3.5,6.5) to (16.5,6.5) runs straight through the cloud at
  // x 7..13, 6 VU of it.
  assert.equal(r.crossing.length, 1);
  assert.equal(r.crossing[0].name, 'Dust Cloud');
  near(r.crossing[0].length, 6, 0.3);
  assert.equal(r.terrainMod, -10);
  assert.deepEqual(r.parts.map((p) => p.value), [-10]);

  assert.equal(reach(m, 'a', 'b', { weaponRange: 6 }).canFire, false, 'out of range');
  assert.equal(reach(m, 'a', 'b', { weaponRange: 6 }).band, 'out');
  assert.equal(reach(m, 'a', 'b').band, null, 'no weapon, no band');
  assert.equal(reach(m, 'a', 'zzz'), null, 'an unknown ship');

  // The planet is between Delta and Charlie: nothing fires through it.
  const blocked = reach(m, 'd', 'c', { weaponRange: 60 });
  assert.equal(blocked.blocked, 'Planet');
  assert.equal(blocked.canFire, false);
  // Sliding the line clear of the disc lets it through.
  const clear = reach(moveShip(m, 'd', { x: 3.5, y: 4.5 }), 'd', 'c', { weaponRange: 60 });
  assert.equal(clear.blocked, null);

  // A station is too small to block, and does not count as terrain.
  assert.ok(!BODY_KINDS.station.blocks);

  // Terrain is capped: four clouds on a line cost -30, not -40.
  const stacked = readVoidMap({
    cols: 60, rows: 28,
    fields: [0, 1, 2, 3].map((i) => ({ kind: 'dust_cloud', shape: 'circle', x: 10 + i * 8, y: 5.5, r: 4 })),
    ships: [{ id: 'a', x: 1.5, y: 5.5 }, { id: 'b', x: 50.5, y: 5.5 }]
  });
  const cap = reach(stacked, 'a', 'b', { weaponRange: 100 });
  assert.equal(cap.crossing.length, 4);
  assert.equal(cap.terrainMod, TERRAIN_FLOOR);
  assert.equal(cap.parts.reduce((n, p) => n + p.value, 0), TERRAIN_FLOOR, 'the parts sum to the capped total');

  // A graze under half a VU is not a crossing.
  const graze = readVoidMap({
    cols: 40, rows: 28,
    fields: [{ kind: 'dust_cloud', shape: 'circle', x: 20, y: 10.499, r: 4 }],
    ships: [{ id: 'a', x: 1.5, y: 6.5 }, { id: 'b', x: 38.5, y: 6.5 }]
  });
  assert.equal(reach(graze, 'a', 'b').crossing.length, 0, 'the tip of a cloud does not count');
}

/* ---- silhouette ---- */
{
  const m = scene();
  // From Delta looking east past Echo... the planet sits at (20,14) r 3.
  // A target at (12.5, 14.5) seen from (3.5, 14.5) has the planet behind it.
  const s = readVoidMap({ ...m, ships: [
    { id: 'x', side: 'player', x: 3.5, y: 14.5 }, { id: 'y', side: 'enemy', x: 14.5, y: 14.5 }
  ] });
  const r = reach(s, 'x', 'y', { weaponRange: 20 });
  assert.equal(r.silhouetted, true, 'the target is seen against the planet');
  assert.equal(r.silhouette, 'Planet');
  // The same target off to one side is not.
  const off = readVoidMap({ ...m, ships: [
    { id: 'x', side: 'player', x: 3.5, y: 4.5 }, { id: 'y', side: 'enemy', x: 14.5, y: 4.5 }
  ] });
  assert.equal(reach(off, 'x', 'y').silhouetted, false);
  // And the other way round: from the far side the target has empty space behind it.
  const rev = readVoidMap({ ...m, ships: [
    { id: 'x', side: 'player', x: 14.5, y: 14.5 }, { id: 'y', side: 'enemy', x: 3.5, y: 14.5 }
  ] });
  assert.equal(reach(rev, 'x', 'y').silhouetted, false, 'it depends on who is looking');
  // A station is too small to silhouette anything.
  assert.equal(silhouetteBehind(m, { x: 20, y: 6 }, { x: 27, y: 6 }), null);

  // The face of a star counts: the star hangs off the top of this chart.
  const star = readVoidMap({ cols: 40, rows: 28, stars: [{ typeId: 'mighty', x: 20, y: -12, r: 10 }],
    ships: [{ id: 'x', x: 20.5, y: 24.5 }, { id: 'y', x: 20.5, y: 12.5 }] });
  assert.equal(reach(star, 'x', 'y').silhouette, 'the star');
  const side = readVoidMap({ ...star, ships: [{ id: 'x', x: 3.5, y: 12.5 }, { id: 'y', x: 30.5, y: 12.5 }] });
  assert.equal(reach(side, 'x', 'y').silhouetted, false, 'looking along the chart, the star is off to the side');
}

/* ---- moving ---- */
{
  const m = scene();
  const mc = moveCheck(m, 'a', { x: 9.5, y: 6.5 }, 7);
  assert.equal(mc.distance, 6);
  assert.equal(mc.over, false);
  assert.equal(moveCheck(m, 'a', { x: 15.5, y: 6.5 }, 7).over, true, 'twelve VU is past Speed 7');
  assert.equal(moveCheck(m, 'a', { x: 15.5, y: 6.5 }).over, false, 'no Speed, no limit');
  // The dust cloud asks nothing of a pilot; a cluster does.
  assert.equal(moveCheck(m, 'a', { x: 15.5, y: 6.5 }, 20).tests.length, 0);
  const into = moveCheck(m, 'e', { x: 30.5, y: 20.5 }, 30);
  assert.equal(into.tests.length, 1);
  assert.equal(into.tests[0].modifier, -10);
  assert.match(into.tests[0].text, /Pilot \(Space Craft\) Test at -10/);
  // Ending inside the field counts even with a short move.
  assert.equal(moveCheck(readVoidMap({ ...m, ships: [{ id: 'a', x: 27.2, y: 20.5 }] }), 'a', { x: 28.5, y: 20.5 }, 5).tests.length, 1);
  // The planet is solid.
  assert.equal(moveCheck(m, 'd', { x: 36.5, y: 14.5 }).solid, 'Planet');
  assert.equal(moveCheck(m, 'd', { x: 3.5, y: 4.5 }).solid, null);
  assert.equal(moveCheck(m, 'zzz', { x: 1, y: 1 }), null);

  assert.deepEqual(snapToSquare(m, { x: 7.2, y: 3.9 }), { x: 7.5, y: 3.5 });
  assert.deepEqual(snapToSquare(m, { x: -4, y: 99 }), { x: 0.5, y: 27.5 }, 'clamped to the chart');
  assert.equal(moveShip(m, 'a', { x: 9.2, y: 9.9 }).ships[0].x, 9.5);
  assert.equal(moveShip(m, 'a', { x: 9.2, y: 9.9 }, { snap: false }).ships[0].x, 9.2);
  assert.equal(turnShip(m, 'a', 450).ships[0].heading, 90);
  assert.equal(bearing({ x: 0, y: 0 }, { x: 0, y: -5 }), 0, 'up is 0');
  assert.equal(bearing({ x: 0, y: 0 }, { x: 5, y: 0 }), 90, 'right is 90');
  assert.equal(bearing({ x: 0, y: 0 }, { x: 0, y: 5 }), 180);
  assert.equal(bearing({ x: 0, y: 0 }, { x: -5, y: 0 }), 270);
  assert.ok(!clearSpace(m, { x: 20, y: 14 }), 'a planet is not somewhere to park');
  assert.ok(clearSpace(m, { x: 5, y: 5 }));
}

/* ---- riptide drift ---- */
{
  const m = scene();
  assert.deepEqual(driftAt(m, { x: 12.5, y: 24.5 }), [2, 0], 'Echo is in the riptide');
  assert.deepEqual(driftAt(m, { x: 12.5, y: 2.5 }), [0, 0]);
  const { map, moved } = applyDrift(m);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].id, 'e');
  assert.equal(map.ships.find((s) => s.id === 'e').x, 14.5, 'carried two squares along the arrows');
  assert.equal(map.ships.find((s) => s.id === 'a').x, 3.5, 'everyone else stays put');
  // Never carried to the edge of the world, or into a planet.
  const edge = readVoidMap({ ...m, ships: [{ id: 'e', x: 39.5, y: 24.5 }] });
  assert.equal(applyDrift(edge).map.ships[0].x, 39.5, 'held at the edge of the chart');
  const wall = readVoidMap({ cols: 40, rows: 28,
    bodies: [{ kind: 'planet', x: 16, y: 24, r: 3 }],
    fields: [{ kind: 'gravity_riptide', shape: 'band', x: 0, y: 24, x2: 40, y2: 24, w: 6, drift: [4, 0] }],
    ships: [{ id: 'e', x: 12.5, y: 24.5 }] });
  assert.equal(applyDrift(wall).moved.length, 0, 'a hull is not driven into a planet');
}

/* ---- placing ships ---- */
{
  const m = scene();
  const roster = [
    { id: 'player', name: 'Sinister', side: 'player', cls: 'Cruiser' },
    { id: 'n1', name: 'Raider 1', side: 'enemy', cls: 'Raider' },
    { id: 'n2', name: 'Raider 2', side: 'enemy', cls: 'Raider' }
  ];
  const base = readVoidMap({ ...m, ships: [] });
  const placed = placeShips(base, roster, 'seed');
  assert.equal(placed.ships.length, 3);
  const me = placed.ships.find((s) => s.id === 'player');
  assert.ok(me.x < placed.cols / 2, 'the crew start on the left');
  assert.equal(me.heading, 90, 'facing the enemy');
  for (const id of ['n1', 'n2']) {
    const s = placed.ships.find((x) => x.id === id);
    assert.ok(s.x > placed.cols / 2, 'hostiles start on the right');
    assert.equal(s.heading, 270);
    assert.ok(clearSpace(placed, s, 1), 'and clear of anything solid');
    assert.equal(s.x % 1, 0.5, 'on a square centre');
  }
  assert.notEqual(placed.ships[1].y, placed.ships[2].y, 'spread down the edge');
  assert.deepEqual(placeShips(base, roster, 'seed'), placed, 'deterministic');

  // A ship already on the chart keeps its place; only new ones are laid out.
  const moved = moveShip(placed, 'player', { x: 10.5, y: 9.5 });
  const again = placeShips(moved, [...roster, { id: 'n3', name: 'Raider 3', side: 'enemy' }]);
  assert.equal(again.ships.length, 4);
  assert.equal(again.ships.find((s) => s.id === 'player').x, 10.5);
  assert.deepEqual(pruneShips(again, ['player', 'n3']).ships.map((s) => s.id), ['player', 'n3']);

  // A planet at the edge does not swallow a ship.
  const crowded = readVoidMap({ cols: 40, rows: 28, bodies: [{ kind: 'planet', x: 37, y: 14, r: 5 }] });
  const p2 = placeShips(crowded, [{ id: 'z', side: 'enemy' }], 'q');
  assert.ok(clearSpace(p2, p2.ships[0], 1.5), 'nudged off a planet that sits on its spawn line');
}

/* ---- redaction ---- */
{
  const m = readVoidMap({
    cols: 40, rows: 28,
    bodies: [
      { id: 'p', kind: 'planet', x: 5, y: 5, r: 2, note: 'Verdant' },
      { id: 'h1', kind: 'hulk', x: 9, y: 9, r: 1, note: 'May be possible to salvage', state: 'ping' },
      { id: 'h2', kind: 'hulk', x: 12, y: 9, r: 1, note: 'secret', state: 'hidden' }
    ],
    fields: [{ id: 'f', kind: 'dust_cloud', x: 20, y: 9, r: 3, state: 'ping' }],
    ships: [
      { id: 'a', name: 'Sinister', side: 'player' },
      { id: 'b', name: 'Raider', cls: 'Raider', side: 'enemy', state: 'ping' },
      { id: 'c', name: 'Ambusher', side: 'enemy', state: 'hidden' }
    ]
  });
  const t = redactVoidForTable(m);
  assert.deepEqual(t.bodies.map((b) => b.id), ['p', 'h1'], 'a hidden body is not there');
  assert.equal(t.bodies[0].note, 'Verdant', 'what is seen is seen');
  assert.equal(t.bodies[1].name, 'Unknown contact');
  assert.equal(t.bodies[1].note, '', 'a pinged hulk gives up nothing');
  assert.equal(t.bodies[1].x, 9, 'but it is still where it is');
  assert.equal(t.bodies[1].kind, 'contact', 'and nothing says what kind of thing it is');
  assert.equal(readVoidMap(t).bodies[1].kind, 'contact', 'a table copy reads back as it was sent');
  // A body the table can only ping never blocks a shot on their copy.
  const wall = redactVoidForTable(readVoidMap({
    cols: 40, rows: 28,
    bodies: [{ kind: 'planet', x: 20, y: 6.5, r: 3, state: 'ping' }],
    ships: [{ id: 'a', x: 3.5, y: 6.5 }, { id: 'b', x: 36.5, y: 6.5 }]
  }));
  assert.equal(reach(wall, 'a', 'b', { weaponRange: 60 }).blocked, null);
  assert.equal(t.fields[0].name, 'Unknown reading');
  assert.equal(t.fields[0].shotMod, 0, 'and its modifier is not leaked');
  assert.deepEqual(t.ships.map((s) => s.id), ['a', 'b']);
  assert.equal(t.ships[1].name, 'Unknown contact');
  assert.equal(t.ships[1].cls, '');
  assert.equal(JSON.stringify(t).includes('secret'), false);
  assert.equal(JSON.stringify(t).includes('Ambusher'), false);
  assert.equal(redactVoidForTable(null), null);

  // The system never leaves the GM's screen.
  const v = { system: { zones: [] }, map: m };
  assert.equal('system' in voidForBridge(v), false);
  assert.ok(voidForBridge(v).map);
  assert.equal('system' in voidForTable(v), false);
  assert.equal(voidForTable(v).map.ships.length, 2, 'and the table gets the redacted chart');
  assert.deepEqual(voidForTable({ system: {} }), {}, 'a state with no chart passes through');
  assert.equal(voidForTable(null), null);

  // The shared ship's copy of the combat doc has no system, and still packs the deck.
  const combat = { phase: 'extended', ground: { npcs: [] }, void: v };
  const sent = combatForBridge(combat);
  assert.equal('system' in sent.void, false);
  assert.ok(sent.void.map, 'the chart goes out');
  assert.equal(sent.phase, 'extended');
  assert.equal(combat.void.system !== undefined, true, 'the GM\'s own copy is untouched');
  assert.deepEqual(combatForBridge({ phase: 'x' }), { phase: 'x' }, 'no void state, nothing changes');
  assert.equal(combatForBridge(null), null);
}

/* ---- building a scene from a rolled system ---- */
const systems = Array.from({ length: 300 }, (_, i) => rollSystem(makeRng('sys' + i)));
const firstWith = (id) => {
  for (const system of systems) {
    const hit = chartableElements(system).find((c) => c.element.id === id);
    if (hit) return { system, hit };
  }
  return null;
};

{
  // Determinism: the same system, pick, size and seed.
  const { system, hit } = firstWith('planet');
  const pick = [{ zoneId: hit.zoneId, index: hit.index }];
  const a = buildScene(system, pick, { seed: 'ABC', size: 'standard' });
  const b = buildScene(system, pick, { seed: 'ABC', size: 'standard' });
  assert.deepEqual(a, b, 'a seed brings the same scene back');
  assert.notDeepEqual(a.bodies, buildScene(system, pick, { seed: 'XYZ' }).bodies, 'a different seed moves things');
  assert.equal(a.cols, 64);
  assert.equal(buildScene(system, pick, { size: 'wide' }).cols, 96);
  assert.deepEqual(readVoidMap(a), a, 'a built scene reads back unchanged');
  assert.equal(a.source.zoneId, hit.zoneId);
  assert.ok(a.source.star.length > 0, 'it says which star it is under');
  assert.ok(a.name.includes('—'), 'it names the zone');
  assert.ok(describeScene(a).includes('64×40 VU'));
}

{
  // Every kind of element builds what it should.
  const planet = firstWith('planet');
  const p = buildScene(planet.system, [{ zoneId: planet.hit.zoneId, index: planet.hit.index }], { seed: 's' });
  const world = p.bodies.find((b) => b.kind === 'planet');
  assert.ok(world, 'a planet is a planet');
  assert.ok(world.r >= 1.8 && world.r <= 5.8);
  assert.ok(world.well > world.r, 'with a gravity well around it');
  assert.ok(world.note.length > 0, 'and what it is, for the GM');

  const giant = firstWith('gas_giant');
  const g = buildScene(giant.system, [{ zoneId: giant.hit.zoneId, index: giant.hit.index }], { seed: 's' });
  const gb = g.bodies.find((b) => b.kind === 'gas_giant');
  assert.ok(gb && gb.r >= 7.5, 'a gas giant is huge');
  assert.ok(g.bodies.filter((b) => b.kind === 'moon').length >= 2, 'and has moons');

  const belt = firstWith('asteroid_belt');
  const bl = buildScene(belt.system, [{ zoneId: belt.hit.zoneId, index: belt.hit.index }], { seed: 's' });
  const bf = bl.fields.find((f) => f.kind === 'asteroid_belt');
  assert.equal(bf.shape, 'band');
  assert.equal(bf.shotMod, FIELD_KINDS.asteroid_belt.shotMod);
  assert.equal(bf.moveMod, -10);
  assert.ok(Math.hypot(bf.x2 - bf.x, bf.y2 - bf.y) > Math.hypot(bl.cols, bl.rows), 'it runs past both edges');
  assert.ok(bl.bodies.some((b) => b.kind === 'asteroid'), 'with rocks you can hit');

  const dust = firstWith('dust_cloud');
  const d = buildScene(dust.system, [{ zoneId: dust.hit.zoneId, index: dust.hit.index }], { seed: 's' });
  assert.equal(d.fields[0].kind, 'dust_cloud');
  assert.equal(d.fields[0].moveMod, null, 'a cloud asks no Pilot test');

  const rip = firstWith('gravity_riptide');
  const r = buildScene(rip.system, [{ zoneId: rip.hit.zoneId, index: rip.hit.index }], { seed: 's' });
  const rf = r.fields[0];
  assert.equal(rf.kind, 'gravity_riptide');
  assert.ok(Math.hypot(rf.drift[0], rf.drift[1]) >= 1.5, 'it carries a hull along');

  const stn = firstWith('derelict_station');
  const s = buildScene(stn.system, [{ zoneId: stn.hit.zoneId, index: stn.hit.index }], { seed: 's' });
  const sb = s.bodies.find((b) => b.kind === 'station');
  assert.ok(sb, 'a station');
  assert.equal(sb.state, 'ping', 'a derelict starts as an unread contact');
  assert.match(sb.note, /Armour \d+, Hull \d+/);

  const yard = firstWith('starship_graveyard');
  const y = buildScene(yard.system, [{ zoneId: yard.hit.zoneId, index: yard.hit.index }], { seed: 's' });
  const hulks = y.bodies.filter((b) => b.kind === 'hulk');
  const rolled = yard.hit.element.site.hulks.length;
  assert.equal(hulks.length, rolled, 'one hulk on the chart for every hulk rolled');
  assert.ok(y.fields.some((f) => f.kind === 'debris'));
  assert.ok(hulks.every((h) => h.state === 'ping'));
  const field = y.fields.find((f) => f.kind === 'debris');
  assert.ok(hulks.every((h) => Math.hypot(h.x - field.x, h.y - field.y) <= field.r), 'all inside the wreckage');
  assert.ok(elementLabel(yard.hit.element).includes(`${rolled} hulks`));
}

{
  // Open void, and the zone's weather.
  const sys = systems.find((s) => s.zones.some((z) => z.elements.some((e) => e.id === 'radiation_bursts' || e.id === 'solar_flares')));
  assert.ok(sys, 'some system has weather');
  const zone = sys.zones.find((z) => z.elements.some((e) => e.id === 'radiation_bursts' || e.id === 'solar_flares'));
  const open = buildScene(sys, [], { zoneId: zone.id, seed: 's' });
  assert.equal(open.bodies.length, 0);
  assert.equal(open.fields.length, 0);
  assert.ok(open.hazards.length >= 1, 'the zone\'s weather follows you');
  assert.ok(open.hazards.every((h) => h.intensity >= 1));
  assert.ok(open.name.startsWith('Open void'));
  assert.ok(chartableElements(sys).every((c) => !['radiation_bursts', 'solar_flares'].includes(c.element.id)),
    'weather is not a place you can chart');
}

{
  // The star the scene sits under.
  const find = (pred) => systems.find(pred);
  const inner = find((s) => s.star.type.id === 'mighty');
  const mightyInner = buildScene(inner, [], { zoneId: 'inner_cauldron', seed: 's' });
  const mightyOuter = buildScene(inner, [], { zoneId: 'outer_reaches', seed: 's' });
  assert.ok(mightyInner.stars[0].r > mightyOuter.stars[0].r * 3, 'the same star fills the sky in the Inner Cauldron and is a point in the Outer Reaches');
  assert.ok(mightyInner.glow > mightyOuter.glow);
  // The inner star leans in over the edge; the outer one sits well clear of it.
  const reachOf = (m) => {
    const s = m.stars[0];
    const edge = Math.max(0, Math.min(s.x, m.cols - s.x, s.y, m.rows - s.y));
    return edge;
  };
  const dull = find((s) => s.star.type.id === 'dull');
  assert.ok(buildScene(dull, [], { zoneId: 'primary_biosphere', seed: 's' }).stars[0].colour.toLowerCase() !== buildScene(inner, [], { zoneId: 'primary_biosphere', seed: 's' }).stars[0].colour.toLowerCase(),
    'a dull star is red, a mighty one is blue-white');
  assert.ok(reachOf(mightyOuter) >= 0);
  const bin = find((s) => s.star.type.id === 'binary');
  assert.equal(buildScene(bin, [], { zoneId: 'primary_biosphere', seed: 's' }).stars.length, 2, 'a Binary is two discs');
  assert.equal(buildScene(inner, [], { zoneId: 'primary_biosphere', seed: 's' }).stars.length, 1);
}

{
  // Several elements in one scene keep clear of each other.
  let tested = 0;
  for (const system of systems) {
    const solid = chartableElements(system).filter((c) => ['planet', 'gas_giant', 'dust_cloud', 'asteroid_cluster'].includes(c.element.id));
    if (solid.length < 2) continue;
    const picks = solid.slice(0, 2).map((c) => ({ zoneId: c.zoneId, index: c.index }));
    const m = buildScene(system, picks, { size: 'wide', seed: 'many' });
    const worlds = m.bodies.filter((b) => b.kind === 'planet' || b.kind === 'gas_giant');
    for (let i = 0; i < worlds.length; i++) {
      for (let j = i + 1; j < worlds.length; j++) {
        assert.ok(Math.hypot(worlds[i].x - worlds[j].x, worlds[i].y - worlds[j].y) > worlds[i].r + worlds[j].r,
          'two worlds never overlap');
      }
    }
    tested++;
    if (tested >= 30) break;
  }
  assert.ok(tested >= 10, 'enough multi-element systems to mean something');
}

/* ---- every scene, every size: nothing escapes ---- */
{
  let scenes = 0;
  for (const system of systems.slice(0, 120)) {
    for (const size of VOID_SIZES.map((s) => s.id)) {
      const els = chartableElements(system);
      const picks = [[], els.slice(0, 1), els.slice(0, 3)].map((l) => l.map((c) => ({ zoneId: c.zoneId, index: c.index })));
      for (const p of picks) {
        const m = buildScene(system, p, { size, seed: 'all', zoneId: 'outer_reaches' });
        const dims = sizeById(size);
        assert.equal(m.cols, dims.cols);
        assert.equal(m.rows, dims.rows);
        for (const b of m.bodies) {
          assert.ok(b.x > -2 && b.x < m.cols + 2 && b.y > -2 && b.y < m.rows + 2, `a ${b.kind} is on the chart`);
          assert.ok(Number.isFinite(b.r) && b.r > 0);
        }
        for (const f of m.fields) {
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
          assert.ok(f.shape === 'band' ? f.w > 0 : f.r > 0);
        }
        assert.deepEqual(readVoidMap(m), m, 'and survives a round trip');
        assert.ok(JSON.stringify(m).length < 30000, 'a scene stays small');
        scenes++;
      }
    }
  }
  assert.ok(scenes > 1000);
}

/* ---- a scene is useful end to end ---- */
{
  const { system, hit } = firstWith('planet');
  let m = buildScene(system, [{ zoneId: hit.zoneId, index: hit.index }], { seed: 'play' });
  m = placeShips(m, [
    { id: 'player', name: 'Sinister', side: 'player', cls: 'Cruiser' },
    { id: 'n1', name: 'Raider', side: 'enemy', cls: 'Raider' }
  ]);
  const r = reach(m, 'player', 'n1', { weaponRange: 60 });
  assert.ok(r.distance > 20, 'opposite edges of a standard chart are well apart');
  assert.equal(r.from.id, 'player');
  assert.equal(typeof r.silhouetted, 'boolean');
  assert.ok(Array.isArray(r.parts));
}

/* ---- firing arcs ---- */
{
  assert.equal(angleDiff(10, 350), 20, 'folds across north');
  assert.equal(angleDiff(350, 10), -20);
  assert.equal(angleDiff(180, 0), 180);
  assert.equal(angleDiff(0, 180), 180);
  assert.equal(angleDiff(270, 90), 180);

  // Defaults are the quadrants, and a dorsal fires everywhere but astern.
  const base = readVoidMap({});
  assert.deepEqual(base.arcs, ARC_DEFAULTS);
  assert.deepEqual(ARC_SLOTS, ['prow', 'port', 'starboard', 'dorsal', 'keel']);
  assert.equal(base.minis, true, 'ships are bases by default: the models are on the table');
  assert.equal(readVoidMap({ minis: false }).minis, false);
  assert.deepEqual(readVoidMap(readVoidMap({ arcs: { prow: { c: 10, w: 60 } } })).arcs.prow, { c: 10, w: 60 }, 'arcs survive a round trip');

  // Anything the chart is told is bounded.
  const odd = readVoidMap({ arcs: { prow: { c: -90, w: 3 }, port: { c: 725, w: 9999 }, dorsal: 'x', keel: { c: 0, w: 90 }, turret: { c: 0, w: 90 } } });
  assert.equal(odd.arcs.prow.c, 270, '-90 reads as 270');
  assert.equal(odd.arcs.prow.w, MIN_ARC, 'an arc cannot be a hairline');
  assert.equal(odd.arcs.port.c, 5);
  assert.equal(odd.arcs.port.w, 360);
  assert.deepEqual(odd.arcs.dorsal, ARC_DEFAULTS.dorsal, 'junk is the default');
  assert.equal('turret' in odd.arcs, false, 'a mount the app does not know is not stored');
  assert.deepEqual(odd.arcs.keel, { c: 0, w: 90 }, 'a keel arc the table sets is kept');

  // A ship facing east (90) at the middle of the chart. North is off its port
  // side, south its starboard.
  const at = (x, y) => ({ x, y });
  const ship = { id: 's', x: 20.5, y: 14.5, heading: 90 };
  const rel = (p) => inArc(base, ship, 'prow', p).relative;
  assert.equal(rel(at(30.5, 14.5)), 0, 'dead ahead');
  assert.equal(rel(at(20.5, 4.5)), 270, 'north of an east-facing ship is to port');
  assert.equal(rel(at(20.5, 24.5)), 90, 'and south to starboard');
  assert.equal(rel(at(10.5, 14.5)), 180, 'west is astern');

  const fires = (slot, p) => inArc(base, ship, slot, p).inArc;
  assert.ok(fires('prow', at(30.5, 14.5)));
  assert.ok(!fires('prow', at(20.5, 4.5)));
  assert.ok(fires('port', at(20.5, 4.5)));
  assert.ok(!fires('port', at(20.5, 24.5)));
  assert.ok(fires('starboard', at(20.5, 24.5)));
  assert.ok(!fires('starboard', at(30.5, 14.5)));
  for (const slot of ['prow', 'port', 'starboard']) assert.ok(!fires(slot, at(10.5, 14.5)), `${slot} cannot fire astern`);
  assert.ok(fires('dorsal', at(30.5, 14.5)) && fires('dorsal', at(20.5, 4.5)) && fires('dorsal', at(20.5, 24.5)), 'a dorsal covers all three');
  assert.ok(!fires('dorsal', at(10.5, 14.5)), 'but not astern');

  // Drydock's cheat sheet: the prow is the forward quarter on a ship smaller
  // than a light cruiser, and fore, port and starboard on a light cruiser or
  // larger.
  for (const cls of ['Transport', 'Raider (Escort)', 'Frigate (Escort)', '']) {
    const small = { ...ship, cls };
    assert.ok(!inArc(base, small, 'prow', at(20.5, 4.5)).inArc, `${cls || 'an unclassed ship'}: the prow does not take the beam`);
  }
  for (const cls of ['Light Cruiser', 'Cruiser', 'Monitor-Cruiser', 'Battleship']) {
    const big = { ...ship, cls };
    assert.ok(inArc(base, big, 'prow', at(30.5, 14.5)).inArc, `${cls}: dead ahead`);
    assert.ok(inArc(base, big, 'prow', at(20.5, 4.5)).inArc, `${cls}: the prow reaches the port beam`);
    assert.ok(inArc(base, big, 'prow', at(20.5, 24.5)).inArc, `${cls}: and the starboard beam`);
    assert.ok(!inArc(base, big, 'prow', at(10.5, 14.5)).inArc, `${cls}: but not astern`);
    assert.equal(inArc(base, big, 'prow', at(30.5, 14.5)).arc.w, 270);
  }
  // an arc the table set by hand stays as it set it, whatever the class
  const handmade = readVoidMap({ arcs: { prow: { c: 0, w: 60 } } });
  assert.ok(!inArc(handmade, { ...ship, cls: 'Cruiser' }, 'prow', at(20.5, 4.5)).inArc, 'a customised prow is not widened');
  assert.equal(inArc(handmade, { ...ship, cls: 'Cruiser' }, 'prow', at(30.5, 14.5)).arc.w, 60);
  // the wedge that is drawn agrees with the shot
  const [bigWedge] = arcWedges(base, { ...ship, cls: 'Light Cruiser' }, [{ name: 'Lance', range: 8, slot: 'prow' }]);
  assert.equal(bigWedge.width, 270);
  const [narrow] = arcWedges(base, { ...ship, cls: 'Frigate (Escort)' }, [{ name: 'Lance', range: 8, slot: 'prow' }]);
  assert.equal(narrow.width, 90);

  // The edge of an arc is inside it; a degree past is not. The prow is +-45.
  const edge = (deg) => { const r = (deg * Math.PI) / 180; return at(20.5 + 10 * Math.sin(r + Math.PI / 2), 14.5 - 10 * Math.cos(r + Math.PI / 2)); };
  assert.ok(fires('prow', edge(45)), 'exactly 45 degrees off the bow is in the prow arc');
  assert.ok(fires('prow', edge(-45)));
  assert.ok(!fires('prow', edge(46)), 'and 46 is not');
  assert.ok(!fires('prow', edge(-46)));
  assert.ok(fires('keel', at(10.5, 14.5)) && fires('keel', at(30.5, 14.5)) && fires('keel', at(20.5, 4.5)), 'a keel mount fires every way, astern included');
  assert.ok(fires('dorsal', edge(135)), 'the dorsal reaches 135 either side');
  assert.ok(!fires('dorsal', edge(136)));

  // No mount named, or one the chart has no arc for: unconstrained.
  assert.ok(inArc(base, ship, null, at(10.5, 14.5)).inArc);
  assert.ok(inArc(base, ship, 'keel', at(10.5, 14.5)).inArc);
  assert.equal(inArc(base, ship, null, at(10.5, 14.5)).arc, null);

  // Custom arcs on the chart are honoured: all-round dorsal, a wide prow.
  const wide = readVoidMap({ arcs: { dorsal: { c: 0, w: 360 }, prow: { c: 0, w: 180 } } });
  assert.ok(inArc(wide, ship, 'dorsal', at(10.5, 14.5)).inArc, 'a 360 arc fires astern');
  assert.ok(inArc(wide, ship, 'prow', at(20.5, 4.5)).inArc, 'a 180 prow takes the beam');
  assert.ok(!inArc(wide, ship, 'prow', at(10.5, 14.5)).inArc);
  // The heading turns the arc with the ship.
  const turned = { ...ship, heading: 270 };
  assert.ok(inArc(base, turned, 'prow', at(10.5, 14.5)).inArc, 'facing west, west is dead ahead');
  assert.ok(!inArc(base, turned, 'prow', at(30.5, 14.5)).inArc);
}

/* ---- arcs in a shot ---- */
{
  const m = readVoidMap({
    cols: 60, rows: 40,
    ships: [
      { id: 'a', name: 'Alpha', side: 'player', x: 20.5, y: 20.5, heading: 90 },
      { id: 'ahead', name: 'Ahead', side: 'enemy', x: 25.5, y: 20.5 },
      { id: 'beam', name: 'Beam', side: 'enemy', x: 20.5, y: 14.5 },
      { id: 'astern', name: 'Astern', side: 'enemy', x: 15.5, y: 20.5 }
    ]
  });
  const prow = reach(m, 'a', 'ahead', { weaponRange: 6, slot: 'prow' });
  assert.equal(prow.canFire, true);
  assert.equal(prow.outOfArc, false);
  assert.equal(prow.arc.relative, 0);
  const wrong = reach(m, 'a', 'beam', { weaponRange: 6, slot: 'prow' });
  assert.equal(wrong.canFire, false, 'in range, and still no shot');
  assert.equal(wrong.outOfArc, true);
  assert.equal(wrong.band, 'standard', 'the band is still reported');
  assert.equal(wrong.arc.relative, 270);
  assert.equal(reach(m, 'a', 'beam', { weaponRange: 6, slot: 'port' }).canFire, true, 'the port battery has it');
  assert.equal(reach(m, 'a', 'beam', { weaponRange: 6 }).canFire, true, 'no mount given, no arc applied');
  assert.equal(reach(m, 'a', 'astern', { weaponRange: 6, slot: 'dorsal' }).canFire, false);

  const guns = [
    { name: 'Prow lance', range: 5, slot: 'prow' },
    { name: 'Port macro', range: 6, slot: 'port' },
    { name: 'Starboard macro', range: 6, slot: 'starboard' },
    { name: 'Dorsal macro', range: 6, slot: 'dorsal' }
  ];
  const bearing = (id) => weaponsBearing(m, 'a', id, guns).filter((x) => x.bears).map((x) => x.weapon.name);
  assert.deepEqual(bearing('ahead'), ['Prow lance', 'Dorsal macro']);
  assert.deepEqual(bearing('beam'), ['Port macro', 'Dorsal macro']);
  assert.deepEqual(bearing('astern'), [], 'nothing bears on a ship astern');
  assert.equal(weaponsBearing(m, 'a', 'ahead', guns).length, 4, 'every weapon is listed, bearing or not');
  assert.deepEqual(weaponsBearing(m, 'a', 'nobody', guns), []);
  assert.deepEqual(weaponsBearing(m, 'a', 'ahead', null), []);
}

/* ---- the wedges a ship covers ---- */
{
  const m = readVoidMap({});
  const ship = { id: 's', x: 10, y: 10, heading: 90 };
  const w = arcWedges(m, ship, [
    { name: 'Lance', range: 5, slot: 'prow' },
    { name: 'Macro A', range: 6, slot: 'port' },
    { name: 'Macro B', range: 8, slot: 'port' },
    { name: 'Torpedoes', range: 12 },
    { name: 'Broken', range: 0, slot: 'prow' }
  ]);
  assert.deepEqual(w.map((x) => x.slot), ['prow', 'port', null], 'one wedge per mount, mounts in order, then the unmounted');
  const prow = w[0];
  assert.equal(prow.range, 5);
  assert.equal(prow.centre, 90, 'the prow looks where the ship looks');
  assert.equal(prow.from, 45);
  assert.equal(prow.to, 135);
  const port = w[1];
  assert.equal(port.range, 8, 'as far as the longest gun in it');
  assert.deepEqual(port.weapons, ['Macro A', 'Macro B']);
  assert.equal(port.centre, 0, 'port of an east-facing ship is north');
  assert.equal(port.from, 315);
  assert.equal(port.to, 45, 'wraps across north');
  const all = w[2];
  assert.equal(all.full, true);
  assert.equal(all.width, 360);
  assert.equal(all.range, 12);
  assert.deepEqual(arcWedges(m, ship, []), []);
  assert.deepEqual(arcWedges(m, ship, null), []);
}

/* ---- turning things ---- */
{
  const p = rotatePoint({ x: 10, y: 5 }, { x: 5, y: 5 }, 90);
  assert.deepEqual(p, { x: 5, y: 10 }, 'east of the centre, turned clockwise, is south of it');
  assert.deepEqual(rotatePoint({ x: 5, y: 0 }, { x: 5, y: 5 }, 90), { x: 10, y: 5 }, 'north goes to east');
  assert.deepEqual(rotatePoint({ x: 3, y: 3 }, { x: 3, y: 3 }, 77), { x: 3, y: 3 });

  const m = readVoidMap({
    cols: 40, rows: 28,
    bodies: [{ id: 'h', kind: 'hulk', x: 10, y: 10, r: 1, rot: 350 }],
    fields: [
      { id: 'belt', kind: 'asteroid_belt', shape: 'band', x: 0, y: 14, x2: 40, y2: 14, w: 8 },
      { id: 'rip', kind: 'gravity_riptide', shape: 'band', x: 0, y: 6, x2: 40, y2: 6, w: 6, drift: [2, 0] },
      { id: 'dust', kind: 'dust_cloud', shape: 'circle', x: 20, y: 14, r: 4, rot: 10 }
    ],
    ships: [{ id: 'a', x: 5.5, y: 5.5, heading: 350 }]
  });
  assert.equal(rotateThing(m, 'ship', 'a', 15).ships[0].heading, 5, 'a ship turns, wrapping past north');
  assert.equal(rotateThing(m, 'ship', 'a', -15).ships[0].heading, 335);
  assert.equal(rotateThing(m, 'body', 'h', 25).bodies[0].rot, 15);
  assert.equal(rotateThing(m, 'field', 'dust', -20).fields[2].rot, 350, 'a round field turns its contents');

  const belt = rotateThing(m, 'field', 'belt', 90).fields[0];
  assert.equal(belt.x, 20, 'a belt turns about its middle');
  assert.equal(belt.x2, 20);
  assert.ok(Math.abs(belt.y2 - belt.y) > 39.9, 'and keeps its length');
  assert.equal(belt.w, 8);
  const rip = rotateThing(m, 'field', 'rip', 90).fields[1];
  assert.deepEqual(rip.drift, [0, 2], 'a riptide carries the way it points after the turn');
  assert.deepEqual(rotateThing(m, 'field', 'rip', 360).fields[1].drift, [2, 0]);
  assert.deepEqual(rotateThing(m, 'nothing', 'x', 90), m, 'an unknown kind turns nothing');
  assert.deepEqual(rotateThing(m, 'ship', 'zzz', 90).ships, m.ships, 'an unknown id turns nothing');
}

/* ---- turning the whole scene ---- */
{
  const m = readVoidMap({
    cols: 40, rows: 28,
    stars: [{ typeId: 'luminous', x: -4, y: 6, r: 8 }],
    bodies: [{ id: 'p', kind: 'planet', x: 30, y: 8, r: 3, rot: 0 }],
    fields: [
      { id: 'rip', kind: 'gravity_riptide', shape: 'band', x: 0, y: 14, x2: 40, y2: 14, w: 6, drift: [2, 0] },
      { id: 'dust', kind: 'dust_cloud', shape: 'circle', x: 10, y: 20, r: 4 }
    ],
    ships: [
      { id: 'a', x: 3.5, y: 5.5, heading: 90 },
      { id: 'b', x: 36.5, y: 22.5, heading: 270 }
    ],
    overlays: [{ id: 'o', shipId: 'a', slot: 'prow', range: 6, name: 'Lance' }]
  });
  const once = rotateScene(m, 1);
  assert.equal(once.cols, 28);
  assert.equal(once.rows, 40, 'width and height swap');
  const a = once.ships.find((s) => s.id === 'a');
  // (3.5, 5.5) in a 40x28 chart goes to (28 - 5.5, 3.5): the top-left ship is now top-right.
  assert.deepEqual([a.x, a.y], [22.5, 3.5]);
  assert.equal(a.heading, 180, 'a ship that faced east now faces south');
  assert.equal(once.bodies[0].rot, 90);
  const rip = once.fields.find((f) => f.id === 'rip');
  assert.deepEqual(rip.drift, [-0, 2].map((v) => v + 0), 'the drift turns too');
  assert.equal(Math.round(rip.x), 14, 'a band across the middle turns to run down it');
  assert.equal(once.fields.find((f) => f.id === 'dust').rot, 90);
  assert.equal(once.overlays.length, 1, 'pinned ranges ride with their ship');
  const sq = (v) => v % 1 === 0.5;
  assert.ok(once.ships.every((s) => sq(s.x) && sq(s.y)), 'ships stay on square centres');
  assert.ok(once.ships.every((s) => s.x > 0 && s.x < once.cols && s.y > 0 && s.y < once.rows), 'and on the chart');

  // Distances and shots do not change when the table is turned.
  const before = reach(m, 'a', 'b', { weaponRange: 60, slot: 'prow' });
  const after = reach(once, 'a', 'b', { weaponRange: 60, slot: 'prow' });
  assert.equal(after.distance, before.distance, 'the same fight from another side');
  assert.equal(after.arc.relative, before.arc.relative, 'and the same bearing off the bow');
  assert.equal(after.canFire, before.canFire);

  assert.deepEqual(rotateScene(m, 4), readVoidMap(m), 'four quarter turns is no turn at all');
  assert.deepEqual(rotateScene(rotateScene(m, 1), -1), readVoidMap(m), 'and a turn back undoes it');
  assert.deepEqual(rotateScene(m, 2), rotateScene(rotateScene(m, 1), 1));
  assert.deepEqual(rotateScene(m, 3), rotateScene(m, -1));
  assert.deepEqual(rotateScene(m, 0), readVoidMap(m));
  const half = rotateScene(m, 2);
  assert.equal(half.cols, 40);
  assert.deepEqual([half.ships[0].x, half.ships[0].y], [36.5, 22.5], 'half a turn puts the corner ship in the opposite corner');
  assert.equal(half.ships[0].heading, 270);
}

/* ---- clearing and removing ---- */
{
  const m = readVoidMap({
    cols: 40, rows: 28, stars: [{ typeId: 'dull', x: 0, y: 0, r: 4 }],
    bodies: [{ id: 'p', kind: 'planet', x: 5, y: 5, r: 2 }],
    fields: [{ id: 'f', kind: 'dust_cloud', x: 20, y: 9, r: 3 }],
    hazards: [{ id: 'solar_flares', name: 'Solar Flares' }],
    ships: [{ id: 'a', x: 3.5, y: 3.5 }, { id: 'b', x: 30.5, y: 3.5 }],
    overlays: [{ id: 'o1', shipId: 'a', slot: 'prow', range: 5 }, { id: 'o2', shipId: 'b', slot: null, range: 6 }]
  });
  const c = clearChart(m, 'everything');
  assert.deepEqual([c.ships, c.bodies, c.fields, c.hazards, c.overlays], [[], [], [], [], []]);
  assert.equal(c.stars.length, 1, 'the star stays');
  assert.equal(c.cols, 40);
  assert.equal(clearChart(m, 'fields').fields.length, 0);
  assert.equal(clearChart(m, 'fields').bodies.length, 1, 'only what was asked');
  assert.equal(clearChart(m, 'bodies').bodies.length, 0);
  assert.equal(clearChart(m, 'ships').ships.length, 0);
  assert.equal(clearChart(m, 'ships').overlays.length, 0, 'with no ships there is nothing to pin a range to');
  assert.equal(clearChart(m, 'overlays').overlays.length, 0);
  assert.equal(clearChart(m, 'overlays').ships.length, 2);

  assert.deepEqual(removeThing(m, 'ship', 'a').overlays.map((o) => o.id), ['o2'], 'a ship takes its pinned ranges with it');
  assert.equal(removeThing(m, 'ship', 'a').ships.length, 1);
  assert.equal(removeThing(m, 'body', 'p').bodies.length, 0);
  assert.equal(removeThing(m, 'field', 'f').fields.length, 0);
  assert.deepEqual(removeThing(m, 'ship', 'nobody'), m);
  assert.deepEqual(pruneShips(m, ['b']).overlays.map((o) => o.id), ['o2'], 'a ship the host dropped loses its pins');
}

/* ---- pinned ranges ---- */
{
  const m = readVoidMap({
    cols: 40, rows: 28,
    ships: [{ id: 'a', name: 'Alpha', side: 'player', x: 10.5, y: 10.5, heading: 90 }, { id: 'b', name: 'Beta', side: 'enemy', x: 30.5, y: 10.5, heading: 270 }]
  });
  const guns = [
    { name: 'Lance', range: 5, slot: 'prow' },
    { name: 'Macro A', range: 6, slot: 'port' },
    { name: 'Macro B', range: 8, slot: 'port' }
  ];
  const pinned = togglePins(m, 'a', guns);
  assert.equal(pinned.overlays.length, 2, 'one pin per mount, not per gun');
  assert.deepEqual(pinned.overlays.map((o) => [o.slot, o.range]), [['prow', 5], ['port', 8]]);
  assert.equal(pinned.overlays[1].name, 'Macro A, Macro B');
  assert.ok(isPinned(pinned, 'a', 'prow') && isPinned(pinned, 'a', 'port'));
  assert.ok(!isPinned(pinned, 'b', 'prow'));
  assert.equal(togglePins(pinned, 'a', guns).overlays.length, 0, 'the same call takes them down again');
  assert.equal(togglePins(m, 'nobody', guns).overlays.length, 0);

  const one = togglePin(m, 'b', 'dorsal', 6, 'Macro');
  assert.equal(one.overlays.length, 1);
  assert.equal(togglePin(one, 'b', 'dorsal', 6).overlays.length, 0, 'and one mount can be pinned alone');
  assert.equal(togglePin(m, 'b', null, 12, 'Torpedoes').overlays[0].slot, null);

  // The wedge follows the ship: where it is, which way it faces.
  const w0 = overlayWedges(pinned);
  assert.equal(w0.length, 2);
  assert.equal(w0[0].wedge.centre, 90);
  const turned = rotateThing(moveShip(pinned, 'a', { x: 20.5, y: 14.5 }), 'ship', 'a', 90);
  const w1 = overlayWedges(turned);
  assert.equal(w1[0].wedge.centre, 180, 'turn the ship and its pinned prow turns with it');
  assert.equal(w1[0].ship.x, 20.5, 'and moves with it');
  assert.equal(overlayWedges(removeThing(pinned, 'ship', 'a')).length, 0);
  assert.deepEqual(overlayWedges(null), []);

  // Pins are bounded and junk is dropped.
  assert.equal(readVoidMap({ overlays: [{ shipId: '', range: 5 }, { shipId: 'a', range: 0 }, { shipId: 'a', range: 5, slot: 'turret' }, 'x'] }).overlays.length, 1);
  assert.equal(readVoidMap({ overlays: [{ shipId: 'a', range: 5, slot: 'turret' }] }).overlays[0].slot, null, 'an unknown mount is all-round');
  assert.equal(readVoidMap({ overlays: Array.from({ length: 200 }, (_, i) => ({ shipId: `s${i}`, range: 5 })) }).overlays.length, MAX_OVERLAYS);

  // The table sees a pin only for a ship it can read.
  const mixed = readVoidMap({
    cols: 40, rows: 28,
    ships: [{ id: 'a', x: 5.5, y: 5.5 }, { id: 'p', x: 9.5, y: 5.5, state: 'ping' }, { id: 'h', x: 12.5, y: 5.5, state: 'hidden' }],
    overlays: [{ shipId: 'a', slot: 'prow', range: 5 }, { shipId: 'p', slot: 'prow', range: 5 }, { shipId: 'h', slot: 'prow', range: 5 }]
  });
  assert.deepEqual(redactVoidForTable(mixed).overlays.map((o) => o.shipId), ['a'], 'a ping or a hidden ship does not give away its guns');
}

/* ---- the chart library ---- */
{
  assert.deepEqual(readVoidLibrary(null), []);
  assert.deepEqual(readVoidLibrary([null, 'x', { id: 'a' }, { id: '', map: {} }, { id: 'b', map: 'nope' }]), []);
  const m1 = buildScene(systems[0], [], { seed: 'LIB1' });
  const r1 = saveChart([], { name: '  Cold derelict ', map: m1, now: 1000 });
  assert.equal(r1.ok, true);
  assert.equal(r1.library.length, 1);
  assert.equal(r1.library[0].name, 'Cold derelict');
  assert.equal(r1.library[0].updatedAt, 1000);
  assert.deepEqual(r1.library[0].map, readVoidMap(m1), 'saved as the reader sees it');
  assert.ok(r1.id && r1.library[0].id === r1.id);

  // Saving over an id replaces it; an unknown id is a new chart.
  const m2 = buildScene(systems[1], [], { seed: 'LIB2' });
  const over = saveChart(r1.library, { id: r1.id, name: 'Renamed', map: m2, now: 2000 });
  assert.equal(over.library.length, 1);
  assert.equal(over.library[0].name, 'Renamed');
  assert.equal(over.library[0].map.seed, 'LIB2');
  assert.equal(over.id, r1.id);
  const fresh = saveChart(r1.library, { id: 'ghost', name: 'Other', map: m2 });
  assert.equal(fresh.library.length, 2, 'an id that is not in the library makes a new chart');
  assert.notEqual(fresh.id, 'ghost');
  assert.equal(saveChart([], { map: m1 }).library[0].name, m1.name, 'no name falls back to the chart\'s');

  // The library is capped by count and by size, and refuses rather than half-saves.
  let lib = [];
  for (let i = 0; i < MAX_SAVED_CHARTS; i++) lib = saveChart(lib, { name: `c${i}`, map: { cols: 20, rows: 20 } }).library;
  assert.equal(lib.length, MAX_SAVED_CHARTS);
  const full = saveChart(lib, { name: 'one too many', map: m1 });
  assert.equal(full.ok, false);
  assert.match(full.error, /Delete one first/);
  assert.equal(saveChart(lib, { id: lib[0].id, name: 'overwrite is fine', map: m1 }).ok, true, 'a full library can still be updated');
  const fat = readVoidMap({ cols: 200, rows: 200, bodies: Array.from({ length: 120 }, (_, i) => ({ kind: 'planet', x: i, y: i, r: 1, note: 'x'.repeat(300), name: 'n'.repeat(60) })) });
  let heavy = [];
  let refused = null;
  for (let i = 0; i < MAX_SAVED_CHARTS && !refused; i++) {
    const r = saveChart(heavy, { name: `fat${i}`, map: fat });
    if (r.ok) heavy = r.library; else refused = r;
  }
  assert.ok(refused, 'big charts hit the size cap before the count');
  assert.match(refused.error, /KB, over the \d+KB/);
  assert.ok(libraryBytes(heavy) <= MAX_LIBRARY_BYTES, 'and what was kept is under it');

  assert.deepEqual(deleteChart(fresh.library, fresh.id).map((c) => c.id), [r1.id]);
  assert.equal(deleteChart(fresh.library, 'nobody').length, 2);
  const sum = chartSummary(over.library[0]);
  assert.deepEqual(Object.keys(sum).sort(), ['cols', 'id', 'name', 'rows', 'ships', 'updatedAt']);
  assert.ok(!('map' in sum), 'a list does not need the maps');
  assert.equal(readSavedChart({ id: 'z', name: 'x'.repeat(300), map: {} }).name.length, 80);

  assert.equal(sameChart(m1, m1), true);
  assert.equal(sameChart(m1, readVoidMap(m1)), true, 'read or not, it is the same chart');
  assert.equal(sameChart(m1, moveShip(placeShips(m1, [{ id: 's', side: 'player' }]), 's', { x: 9.5, y: 9.5 })), false);
  assert.equal(sameChart(null, m1), false);
}

console.log('voidmap checks passed');
