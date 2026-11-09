// Self-check for the ship plan. Run: node src/shipplan.check.mjs
import assert from 'node:assert/strict';
import {
  partsOfBlueprint, partsOfNpc, npcEssentials, critTargets, driveOf, shipPlan, shapeFor, zoneOf, labelOf, STATUSES, fitLabel
} from './shipplan.js';
import { HULLS, hullById, ESSENTIAL_CATEGORIES } from './ship.js';

const lunar = {
  hullId: 'hull-lunar',
  essential: {
    plasmaDrive: 'drive-jovian4', warpEngine: 'warp-strelov2', gellerField: 'geller-basic', voidShield: 'shield-single',
    bridge: 'bridge-combat', lifeSustainer: 'life-vitae', crewQuarters: 'quarters-voidsmen', augurArray: 'augur-m100'
  },
  weapons: [
    { slot: 'prow', componentId: 'weap-lance-starbreaker' },
    { slot: 'port', componentId: 'weap-macrocannon-mars' }, { slot: 'port', componentId: 'weap-macrocannon-mars' },
    { slot: 'starboard', componentId: 'weap-macrocannon-mars' }, { slot: 'starboard', componentId: 'weap-macrocannon-mars' }
  ],
  supplemental: ['comp-munitorum', 'comp-tenebro-maze', 'comp-smugglers-hold']
};

/* ---- what a ship carries ---- */
const parts = partsOfBlueprint(lunar);
assert.equal(parts.length, 8 + 5 + 3, 'one part per essential, per mount and per supplemental');
assert.equal(parts.filter((p) => p.slot === 'port').length, 2, 'two port batteries are two compartments');
assert.ok(parts.find((p) => p.id === 'comp-tenebro-maze').noCrit, 'the Tenebro-Maze cannot be critically hit');
const targets = critTargets(parts);
assert.ok(!targets.includes('comp-tenebro-maze'), 'so a critical never lands on it');
assert.equal(targets.filter((t) => t === 'weap-macrocannon-mars').length, 1, 'and each component is one target');
assert.equal(driveOf(parts), 'drive-jovian4');
assert.deepEqual(partsOfBlueprint(null), []);

assert.equal(npcEssentials(hullById('hull-hazeroth'), null).plasmaDrive, 'drive-jovian2', 'a raider gets the escort drive');
assert.equal(npcEssentials(hullById('hull-lunar'), null).plasmaDrive, 'drive-jovian4', 'a cruiser the cruiser drive');
assert.equal(npcEssentials(hullById('hull-jericho'), null).plasmaDrive, 'drive-jovian1', 'a transport the transport drive');
for (const h of HULLS) {
  const ess = npcEssentials(h, null);
  assert.deepEqual(Object.keys(ess).sort(), [...ESSENTIAL_CATEGORIES].sort(), `${h.name}: every essential is implied`);
}
const npc = partsOfNpc({ hullId: 'hull-sword', weapons: ['weap-macrocannon-mars', 'weap-macrocannon-mars', 'weap-lance-starbreaker'] }, null);
assert.equal(npc.length, 8 + 3);
assert.deepEqual(npc.filter((p) => p.category === 'weapon').map((p) => p.slot), ['dorsal', 'dorsal', 'dorsal'], 'weapons sit in the hull’s mounts in turn');
assert.ok(npc.filter((p) => p.category !== 'weapon').every((p) => p.implied), 'and its essentials are marked implied');
assert.deepEqual(partsOfNpc({ hullId: 'nope' }, null), []);

/* ---- the shape ---- */
assert.equal(shapeFor('Raider (Escort)'), 'escort');
assert.equal(shapeFor('Frigate (Escort)'), 'escort');
assert.equal(shapeFor('Light Cruiser'), 'light');
assert.equal(shapeFor('Cruiser'), 'cruiser');
assert.equal(shapeFor('Monitor-Cruiser'), 'cruiser');
assert.equal(shapeFor('Transport'), 'transport');
assert.equal(shapeFor('Some homebrew barge'), 'cruiser', 'an unknown weight is drawn as a cruiser');

/* ---- where things go ---- */
const sh = { spire: {} };
assert.equal(zoneOf({ category: 'plasmaDrive' }, sh), 'stern');
assert.equal(zoneOf({ category: 'bridge' }, sh), 'tower');
assert.equal(zoneOf({ category: 'augurArray' }, sh), 'spire');
assert.equal(zoneOf({ category: 'augurArray' }, { spire: null }), 'dorsal', 'no spire on an escort: the augurs go in the superstructure');
assert.equal(zoneOf({ category: 'weapon', slot: 'port' }, sh), 'lower', 'broadsides on the gun decks');
assert.equal(zoneOf({ category: 'weapon', slot: 'prow' }, sh), 'prow');
assert.equal(zoneOf({ category: 'weapon', slot: 'keel' }, sh), 'ventral');
assert.equal(zoneOf({ category: 'supplemental', name: "Smuggler's Hold" }, sh), 'ventral');
assert.equal(zoneOf({ category: 'supplemental', name: 'Munitorum' }, sh), 'lower');
assert.equal(zoneOf({ category: 'supplemental', name: 'Tenebro-Maze' }, sh), 'dorsal');
assert.equal(labelOf({ category: 'weapon', slot: 'starboard' }), 'Starboard battery');
assert.equal(labelOf({ category: 'voidShield' }), 'Void shield generators');
assert.equal(labelOf({ category: 'supplemental', name: 'Munitorum' }), 'Munitorum');

/* ---- the plan ---- */
const vitals = {
  componentStatus: { 'weap-macrocannon-mars': 'damaged', 'drive-jovian4': 'offline', 'life-vitae': 'destroyed' },
  fires: [{ id: 'f1', location: 'quarters-voidsmen' }, { id: 'f2', location: 'unspecified' }],
  conditions: ['adrift', 'shields_collapsed', 'no_extended_actions']
};
const hull = hullById('hull-lunar');
const plan = shipPlan({ hull, parts, vitals });
const real = plan.rooms.filter((r) => r.id);
assert.equal(real.length, parts.length, 'a compartment for every part');
for (const p of parts) assert.ok(real.some((r) => r.id === p.id && r.category === p.category), `${p.name} is on the plan`);
// Inside its zone, and nothing on top of anything else.
for (const r of plan.rooms) {
  const z = plan.zones.find((zz) => zz.zone === r.zone);
  assert.ok(z && r.x >= z.x - 0.2 && r.y >= z.y - 0.2 && r.x + r.w <= z.x + z.w + 0.2 && r.y + r.h <= z.y + z.h + 0.2, `${r.label} sits inside the ${r.zone}`);
  assert.ok(r.w > 4 && r.h > 4, `${r.label} is big enough to see: ${r.w}x${r.h}`);
  if (r.zone !== 'spine') assert.ok(r.w >= 18, `${r.label} is no sliver: ${r.w} wide`);
}
for (let i = 0; i < plan.rooms.length; i++) for (let j = i + 1; j < plan.rooms.length; j++) {
  const a = plan.rooms[i], b = plan.rooms[j];
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  assert.ok(ox <= 0.3 || oy <= 0.3, `${a.label} and ${b.label} do not overlap`);
}
const room = (pred) => plan.rooms.find(pred);
assert.equal(room((r) => r.category === 'plasmaDrive').zone, 'stern');
assert.equal(room((r) => r.category === 'voidShield').y, plan.zones.find((z) => z.zone === 'stern').y, 'the shields over the drive');
assert.equal(room((r) => r.category === 'bridge').zone, 'tower');
assert.equal(plan.rooms.filter((r) => r.slot === 'port' && r.status === 'damaged').length, 2, 'a damaged battery type shows on each of its mounts');
assert.deepEqual(plan.rooms.filter((r) => r.slot === 'port').map((r) => r.label).sort(), ['Port battery', 'Port battery 2'], 'two of a kind are numbered');
assert.equal(new Set(plan.rooms.filter((r) => !r.filler).map((r) => r.label)).size, plan.rooms.filter((r) => !r.filler).length, 'every compartment has a name of its own');
assert.equal(room((r) => r.category === 'plasmaDrive').status, 'offline');
assert.deepEqual(room((r) => r.category === 'plasmaDrive').flags, ['adrift']);
assert.deepEqual(room((r) => r.category === 'voidShield').flags, ['collapsed']);
assert.deepEqual(room((r) => r.category === 'bridge').flags, ['smashed']);
assert.equal(room((r) => r.category === 'lifeSustainer').status, 'destroyed');
assert.equal(room((r) => r.category === 'crewQuarters').burning, true, 'the fire is where it was set');
assert.equal(plan.unplacedFires, 1, 'and one with no place is counted');
assert.equal(room((r) => r.category === 'augurArray').status, 'working');
assert.ok(room((r) => r.key === 'spine'), 'the spine runs through it');
const usedSpace = parts.reduce((n, p) => n + p.space, 0);
const holds = room((r) => r.key === 'free');
assert.ok(usedSpace < hull.space && holds && holds.zone === 'ventral' && /unused/.test(holds.name), 'unused space is holds');
assert.ok(STATUSES.includes('destroyed'));

// An empty zone is still hull: filled, not left out.
const bare = shipPlan({ hull: hullById('hull-sword'), parts: partsOfNpc({ hullId: 'hull-sword', weapons: [] }, null) });
assert.ok(bare.rooms.some((r) => r.filler && r.zone === 'lower' && r.label === 'Gun decks'), 'no broadsides: the gun decks are still there');
assert.equal(bare.shape, 'escort');
assert.ok(bare.rooms.find((r) => r.category === 'augurArray').zone === 'dorsal', 'an escort carries its augurs in the superstructure');
// Every hull can be planned, and a plan with nothing is still a ship.
for (const h of HULLS) assert.ok(shipPlan({ hull: h, parts: partsOfNpc({ hullId: h.id, weapons: ['weap-macrocannon-mars'] }, null) }).rooms.length > 9, h.name);
assert.ok(shipPlan({}).rooms.length > 5, 'no hull at all still draws a ship');

/* ---- labels ---- */
{
  const big = fitLabel('Plasma Drive', 160, 140);
  assert.ok(big && big.size === 20 && big.lines.length === 1, 'room to spare: the largest size, one line');
  const tall = fitLabel('Void shield generators', 90, 70);
  assert.ok(tall && tall.lines.length > 1 && tall.lines.every((l) => l.length * tall.size * 0.56 <= 90 - 12), 'a narrow room wraps: ' + JSON.stringify(tall));
  assert.ok(tall.lines.length * tall.size * 1.15 <= 70 - 6, 'and stacks inside it');
  assert.equal(fitLabel('Starboard battery', 14, 10), null, 'a sliver gets no label, only its tooltip');
  assert.equal(fitLabel('', 100, 100), null);
  const s = fitLabel('Munitorum', 60, 40);
  assert.ok(s && s.size >= 7 && s.lines[0] === 'Munitorum');
  // every room on a real plan that is big enough to read has a label
  const p = shipPlan({ hull: hullById('hull-lunar'), parts });
  for (const r of p.rooms) if (r.w >= 60 && r.h >= 28) assert.ok(fitLabel(r.label, r.w, r.h), `${r.label} (${r.w}x${r.h}) is labelled`);
}

console.log('shipplan.js OK');
