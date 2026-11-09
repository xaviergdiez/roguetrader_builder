// Self-check for mapping a compartment. Run: node src/compartmentdeck.check.mjs
import assert from 'node:assert/strict';
import { compartmentDeck, kindOf, deckSizeFor, deckNameFor } from './compartmentdeck.js';
import { shipPlan, partsOfBlueprint } from './shipplan.js';
import { hullById } from './ship.js';
import { MAP_THEMES, COVER_TYPES, MARKER_TYPES } from './battlemap.js';
import { DECK_STYLES } from './mapgen.js';

const bp = {
  hullId: 'hull-lunar',
  essential: { plasmaDrive: 'drive-jovian4', warpEngine: 'warp-strelov2', gellerField: 'geller-basic', voidShield: 'shield-single',
    bridge: 'bridge-combat', lifeSustainer: 'life-vitae', crewQuarters: 'quarters-voidsmen', augurArray: 'augur-m100' },
  weapons: [{ slot: 'prow', componentId: 'weap-lance-starbreaker' }, { slot: 'port', componentId: 'weap-macrocannon-mars' }, { slot: 'port', componentId: 'weap-macrocannon-mars' }],
  supplemental: ['comp-munitorum', 'comp-tenebro-maze', 'comp-smugglers-hold']
};
const plan = shipPlan({ hull: hullById('hull-lunar'), parts: partsOfBlueprint(bp) });
const room = (pred) => plan.rooms.find(pred);
const themes = MAP_THEMES.map((t) => t.id), covers = COVER_TYPES.map((c) => c.id), markers = MARKER_TYPES.map((m) => m.id);
const styles = DECK_STYLES.map((d) => d.id);

// Every compartment on the plan maps to a real ground, style and props.
for (const r of plan.rooms) {
  const k = kindOf(r);
  assert.ok(themes.includes(k.theme), `${r.label}: ${k.theme} is a ground`);
  assert.ok(styles.includes(k.style), `${r.label}: ${k.style} is a deck style`);
  for (const c of k.cover) assert.ok(covers.includes(c), `${r.label}: cover ${c} exists`);
  for (const m of k.markers) assert.ok(markers.includes(m), `${r.label}: marker ${m} exists`);
}
assert.equal(kindOf(room((r) => r.category === 'plasmaDrive')).theme, 'enginarium', 'the drive is in the Enginarium');
assert.equal(kindOf(room((r) => r.category === 'bridge')).theme, 'command_deck', 'the bridge on the Command Deck');
assert.equal(kindOf(room((r) => r.category === 'crewQuarters')).style, 'warren', 'quarters are a warren of cells');
assert.equal(kindOf(room((r) => /Smuggler/.test(r.name))).theme, 'cargo_lanes', 'a hold is cargo');
assert.equal(kindOf(room((r) => r.key === 'free')).style, 'hulk', 'the holds are big chambers');
assert.equal(kindOf(room((r) => /Tenebro/.test(r.name))).style, 'warren', 'the maze is a maze');
assert.equal(kindOf({ label: 'Hangar Deck', name: 'Hangar Deck' }).theme, 'hangar_bay');
assert.equal(kindOf({ label: 'Medicae Ward', name: 'Medicae Ward' }).theme, 'medicae');
assert.equal(kindOf({}).theme, 'rogue_trader', 'anything else is a flagship deck');

// Sized by Space, shaped like the compartment.
const small = deckSizeFor({ space: 0, w: 60, h: 40 });
const big = deckSizeFor({ space: 14, w: 160, h: 140 });
assert.ok(big.cols * big.rows > small.cols * small.rows, 'more Space, more deck');
const long = deckSizeFor({ space: 0, filler: true, w: 640, h: 18 });
assert.ok(long.cols > long.rows * 2, 'the spine is long: ' + JSON.stringify(long));
for (const s of [small, big, long]) assert.ok(s.cols >= 14 && s.rows >= 10 && s.cols <= 64 && s.rows <= 44, JSON.stringify(s));

// The deck itself.
const drive = room((r) => r.category === 'plasmaDrive');
const d = compartmentDeck(drive, { shipName: 'Emperor’s Wrath' });
assert.equal(d.name, 'Emperor’s Wrath: Plasma Drive');
assert.equal(d.name, deckNameFor('Emperor’s Wrath', drive));
assert.equal(d.map.theme, 'enginarium');
assert.equal(d.map.cols, d.cols); assert.equal(d.map.rows, d.rows);
const floor = Object.keys(d.map.floor);
assert.ok(floor.length > 60, 'there is a deck: ' + floor.length + ' squares');
assert.ok(Object.keys(d.map.doors).length >= 1, 'with doors between its rooms');
const props = Object.keys(d.map.cover);
assert.ok(props.length >= 2, 'dressed with cover: ' + props.length);
assert.ok(props.every((k) => d.map.floor[k] && !d.map.doors[k]), 'on the deck, never in a doorway');
assert.ok(Object.values(d.map.cover).every((c) => ['machinery', 'tank'].includes(c)), 'the drive room’s own props');
assert.ok(Object.values(d.map.markers).some((m) => m.type === 'cogitator'), 'and its terminal');
assert.ok(Object.keys(d.map.markers).every((k) => !d.map.cover[k]), 'no marker on top of cover');
// The same compartment maps the same way; another maps differently.
assert.deepEqual(compartmentDeck(drive, { shipName: 'Emperor’s Wrath' }).map.floor, d.map.floor, 'seeded: the same deck again');
assert.notDeepEqual(compartmentDeck(drive, { shipName: 'Another ship' }).map.floor, d.map.floor, 'another ship, another deck');
const bridge = compartmentDeck(room((r) => r.category === 'bridge'), { shipName: 'X' });
assert.equal(Object.values(bridge.map.markers).filter((m) => m.type === 'cogitator').length >= 2, true, 'a bridge has its stations');
// Every compartment on the plan can be mapped.
for (const r of plan.rooms) {
  const x = compartmentDeck(r, { shipName: 'Every' });
  assert.ok(Object.keys(x.map.floor).length > 30, `${r.label} maps to a deck`);
}
console.log('compartmentdeck.js OK');
