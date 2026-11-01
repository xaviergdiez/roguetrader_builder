// Self-check for the armour totals on the sheet. Run: node src/armour.check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArmour, armourSummary, soakAt, SLOTS } from './armour.js';
import { GEAR, parseGear, gearInfo } from './gear.js';

const at = (sum, id) => sum.slots.find((s) => s.id === id);
const aps = (sum) => Object.fromEntries(sum.slots.map((s) => [s.id, s.ap]));

/* ---- reading a stats line ---- */
assert.deepEqual(parseArmour('AP 4 · body, arms, legs').covers, ['rarm', 'larm', 'body', 'rleg', 'lleg']);
assert.equal(parseArmour('AP 4 · body, arms, legs').ap, 4);
assert.deepEqual(parseArmour('AP 3 · all · aids concealment').covers, SLOTS.map((s) => s.id));
assert.deepEqual(parseArmour('AP 2 · head').covers, ['head']);
assert.deepEqual(parseArmour('AP 1 · arms, body, legs').covers, ['rarm', 'larm', 'body', 'rleg', 'lleg']);
assert.deepEqual(parseArmour('AP 3 · body, legs').covers, ['body', 'rleg', 'lleg']);
{
  const p = parseArmour('AP 7 all · +10 Strength, Unnatural Strength (x2) · vox-caster');
  assert.equal(p.ap, 7); assert.equal(p.covers.length, 6, 'cover beside the number');
}
{
  const p = parseArmour('AP 8 (9 body) · +20 Strength · auto-senses');
  assert.equal(p.ap, 8); assert.equal(p.overrides.body, 9);
  assert.equal(p.covers.length, 6, 'a suit with no cover named is the whole body');
}
{
  const p = parseArmour('Micro-mesh under the skin · AP 1 body (Good: AP 2) · stacks with worn armour');
  assert.equal(p.ap, 1); assert.equal(p.goodAp, 2); assert.equal(p.stacks, true);
  assert.deepEqual(p.covers, ['body']);
}
assert.equal(parseArmour('1d10+3 E · Pen 0 · Balanced'), null, 'a weapon has no AP');
assert.equal(parseArmour(''), null);
assert.equal(parseArmour(null), null);

/* ---- adding it up ---- */
{
  const none = armourSummary([]);
  assert.equal(none.any, false);
  assert.deepEqual(aps(none), { head: 0, rarm: 0, larm: 0, body: 0, rleg: 0, lleg: 0 });
  assert.equal(none.bodyAp, 0);
  assert.equal(armourSummary(['lasgun', 'micro-bead', 'nonsense']).any, false, 'weapons and trinkets give none');
}
{
  const s = armourSummary(['Best guard flak armour']);
  assert.deepEqual(aps(s), { head: 0, rarm: 4, larm: 4, body: 4, rleg: 4, lleg: 4 }, 'flak leaves the head bare');
  assert.equal(s.bodyAp, 4);
  assert.equal(s.any, true);
}
{
  // a helmet and a vest are different locations: both count, nothing is spare
  const s = armourSummary(['flak helmet', 'flak vest']);
  assert.equal(at(s, 'head').ap, 2);
  assert.equal(at(s, 'body').ap, 3);
  assert.equal(at(s, 'rarm').ap, 0);
  assert.deepEqual(s.slots.flatMap((x) => x.spare), []);
}
{
  // worn armour does not stack: the better piece counts, the other is spare
  const s = armourSummary(['flak vest', 'carapace chestplate']);
  assert.equal(at(s, 'body').ap, 6);
  assert.deepEqual(at(s, 'body').from, ['carapace chestplate']);
  assert.deepEqual(at(s, 'body').spare, ['flak vest']);
}
{
  // a choice left listed counts once, as the better of the two
  const s = armourSummary(['enforcer light carapace', 'synskin']);
  assert.equal(at(s, 'body').ap, 5);
  assert.equal(at(s, 'head').ap, 3, 'synskin covers the head, the carapace does not');
}
{
  // power armour, with the body better than the rest
  const s = armourSummary(['Ignatus Power Armour']);
  assert.deepEqual(aps(s), { head: 8, rarm: 8, larm: 8, body: 9, rleg: 8, lleg: 8 });
  assert.equal(s.bodyAp, 9);
}
{
  // sub-dermal armour stacks on top of what is worn; Good is better
  const common = armourSummary(['flak vest', 'sub-dermal armour']);
  assert.equal(at(common, 'body').ap, 3 + 1);
  assert.deepEqual(at(common, 'body').from, ['flak vest', 'sub-dermal armour']);
  const good = armourSummary(['flak vest', 'Good Sub-Dermal Armour']);
  assert.equal(at(good, 'body').ap, 3 + 2);
  assert.equal(at(good, 'head').ap, 0, 'only the body');
  assert.equal(armourSummary(['sub-dermal armour']).bodyAp, 1, 'on its own it is still armour');
}
{
  // a good bionic limb is a note, not a guess at a side
  const s = armourSummary(['Good Bionic Arm']);
  assert.equal(s.any, false);
  assert.equal(s.notes.length, 1);
  assert.ok(/\+1 AP/.test(s.notes[0]));
  assert.equal(armourSummary(['Bionic Arm']).notes.length, 0, 'a common limb adds nothing');
}
assert.equal(soakAt({ ap: 4 }, 3), 7, 'AP and Toughness Bonus together');
assert.equal(soakAt(null, 3), 3);
assert.equal(soakAt({ ap: 2 }, undefined), 2);

/* ---- the catalogue itself ---- */
// Every armour piece in the catalogue says an AP the sheet can read, and every
// location it names is one the sheet has.
for (const [name, e] of Object.entries(GEAR)) {
  if (e.kind !== 'Armour' && e.kind !== 'Power Armour') continue;
  const p = parseArmour(e.stats);
  assert.ok(p && p.ap > 0, `${name}: reads as armour`);
  assert.ok(p.covers.length > 0, `${name}: covers something`);
}

/* ---- the kit the careers are issued ---- */
// Read from the source because the careers live in the JSX and cannot be
// imported. Everything issued resolves, and every piece of armour in it
// reaches the sheet with the AP its own label states, where it states one.
{
  const src = readFileSync(new URL('./RogueTraderBuilder.jsx', import.meta.url), 'utf8');
  const re = /\bgear:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let m; let strings = 0; const unknown = []; const mismatch = [];
  while ((m = re.exec(src))) {
    strings++;
    const text = (m[1] ?? m[2]).replace(/\\u2019/g, '’').replace(/\\'/g, "'");
    for (const alts of parseGear(text)) {
      for (const label of alts) {
        const { entry } = gearInfo(label);
        if (!entry) { unknown.push(label); continue; }
        if (entry.kind !== 'Armour') continue;
        const stated = label.match(/\(AP\s*(\d+)/i);
        const got = parseArmour(entry.stats);
        if (stated && got && Number(stated[1]) !== got.ap) mismatch.push(`${label} says ${stated[1]}, the catalogue ${got.ap}`);
      }
    }
  }
  assert.ok(strings >= 14, 'found the careers’ gear strings (' + strings + ')');
  assert.deepEqual(unknown, [], 'issued gear with no entry: ' + unknown.join(', '));
  assert.deepEqual(mismatch, [], 'a label and the catalogue disagree: ' + mismatch.join('; '));
}

console.log('armour checks passed');
