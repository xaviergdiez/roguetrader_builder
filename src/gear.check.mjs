// Self-check for the gear parser and catalogue lookup.
// Run: node src/gear.check.mjs
import assert from 'node:assert/strict';
import { parseGear, gearInfo, GEAR } from './gear.js';

// the Explorator string exercises every rule the grammar has: " or " choices,
// "; " groups, ", " items, and a trailing sentence
const explorator =
  'Boltgun or best lasgun or good hellgun; best shock staff or good power axe; ' +
  'enforcer light carapace, void suit, injector, sacred unguents, micro-bead, ' +
  'combi-tool, dataslate. Begins play owning one servo-skull familiar.';

const groups = parseGear(explorator);
assert.deepEqual(groups[0], ['Boltgun', 'best lasgun', 'good hellgun']);
assert.deepEqual(groups[1], ['best shock staff', 'good power axe']);
assert.deepEqual(groups[2], ['enforcer light carapace']);
// the trailing sentence survives as its own group, not glued to "dataslate"
assert.deepEqual(groups[groups.length - 1], ['Begins play owning one servo-skull familiar']);
// no empty groups or empty labels anywhere
assert.ok(groups.every((g) => g.length > 0 && g.every((s) => s.trim().length > 0)));

// craftsmanship is split off the label, and the base item still resolves
const best = gearInfo('best lasgun');
assert.equal(best.quality, 'best');
assert.equal(best.entry, GEAR['lasgun']);

// no craftsmanship prefix means no quality, and the entry still resolves
const plain = gearInfo('Boltgun');
assert.equal(plain.quality, null);
assert.equal(plain.entry, GEAR['boltgun']);

// articles, counts and the mono upgrade suffix are stripped
assert.equal(gearInfo('a good primitive melee weapon with mono upgrade').entry,
  GEAR['primitive melee weapon']);
assert.equal(gearInfo('two sets of robes').entry, GEAR['robe']);
assert.equal(gearInfo('Begins play owning one servo-skull familiar').entry,
  GEAR['servo-skull familiar']);

// plurals fall back to the singular key
assert.equal(gearInfo('sacred unguents').entry, GEAR['sacred unguent']);
assert.equal(gearInfo('two bolt pistols').entry, GEAR['bolt pistol']);

// an unknown item resolves to null rather than throwing — it renders flat
assert.equal(gearInfo('warp-touched nonsense').entry, null);

// every label in every career's gear string resolves to a catalogue entry
const strings = [
  'Best laspistol or good hand cannon or common plasma pistol; best mono-sword or common power sword; micro-bead, void suit, fine clothing, xeno-pelt cloak, best enforcer light carapace or storm trooper carapace.',
  'Good hellgun or best hunting rifle or two bolt pistols; a good primitive melee weapon with mono upgrade; micro-bead, void suit, enforcer light carapace, bolt shell keepsake, medikit, manacles.',
  'Best laspistol or best stub automatic; best mono-sword or common shock staff; guard flak armour, charm, void suit, micro-bead, psy-focus.',
  explorator,
  'Good chainsword or best staff; good flamer or best lasgun; best guard flak armour, Ecclesiarchal robes, aquila pendant, censer.',
  'Best hellpistol or good hand cannon; best metal staff, best xeno-mesh armour, Emperor’s tarot deck, silk headscarf, Nobilite signet, micro-bead.',
  'Best hellpistol or common inferno pistol; best hellgun or common boltgun; xeno-mesh armour, autoquill, dataslate, micro-bead, multikey, two sets of robes, synskin, chrono, cameleoline cloak.',
  'Best mono-sword or common power sword; best hand cannon or common bolt pistol; guard flak, micro-bead, void suit, blessed ship token, re-breather, Navy uniform, pict-recorder, vox-caster.'
];
const missing = [];
for (const str of strings) {
  for (const group of parseGear(str)) {
    for (const label of group) {
      if (!gearInfo(label).entry) missing.push(label);
    }
  }
}
assert.deepEqual(missing, [], 'gear with no catalogue entry: ' + missing.join(', '));

console.log('gear: all checks passed (%d careers, %d catalogue entries)',
  strings.length, Object.keys(GEAR).length);
