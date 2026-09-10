// Self-check for the career advance tables. Run: node src/advances.check.mjs
import assert from 'node:assert/strict';
import {
  CAREER_ADVANCES, CAREERS_WITH_TABLES, advancesFor, baseCareer,
  parsePrereq, unmetCharPrereqs, MAX_TABLED_RANK
} from './advances.js';

// all eight careers now have published tables
assert.deepEqual(CAREERS_WITH_TABLES.slice().sort(),
  ['Arch-Militant', 'Astropath Transcendent', 'Explorator', 'Missionary',
   'Navigator', 'Rogue Trader', 'Seneschal', 'Void-Master']);

// every career covers ranks 1-4, and every entry is well formed — a typo in a
// cost or type would otherwise pass silently into the UI
for (const [career, ranks] of Object.entries(CAREER_ADVANCES)) {
  assert.deepEqual(Object.keys(ranks).map(Number), [1, 2, 3, 4], career + ': ranks');
  for (const [rank, list] of Object.entries(ranks)) {
    assert.ok(list.length, career + ' rank ' + rank + ' is empty');
    for (const a of list) {
      const where = `${career} r${rank} ${a.name}`;
      assert.ok(a.name && typeof a.name === 'string', where + ': name');
      assert.ok(['Skill', 'Talent', 'Technique', 'Power'].includes(a.type),
        where + ': type ' + a.type);
      assert.ok(Number.isInteger(a.cost) && a.cost > 0, where + ': cost');
      assert.ok(a.prereq === null || typeof a.prereq === 'string', where + ': prereq');
    }
  }
}

// a career outside the eight is distinguishable from a rank with no entries
assert.equal(advancesFor('Eldar Corsair', 1), null, 'no table for xenos paths');
assert.equal(advancesFor('Ork Weirdboy', 1), null);
assert.ok(Array.isArray(advancesFor('Explorator', 1)));
assert.ok(Array.isArray(advancesFor('Seneschal', 1)));
assert.ok(Array.isArray(advancesFor('Void-Master', 4)));
assert.deepEqual(advancesFor('Explorator', 9), [], 'a rank beyond the table is empty, not null');

// sheets carry alternate ranks and parentheticals, so match the base name
assert.equal(baseCareer('Explorator'), 'Explorator');
assert.equal(baseCareer('Explorator (Alternate Rank: Acolyte of Abraxas)'), 'Explorator');
assert.equal(baseCareer('rogue trader'), 'Rogue Trader');
assert.equal(baseCareer('  Arch-Militant  '), 'Arch-Militant');
assert.equal(baseCareer('Eldar Corsair (Into the Storm Supplement)'), null);
assert.equal(baseCareer(''), null);
assert.equal(baseCareer(null), null);

// known contents, spot-checked against the tables as given
assert.equal(advancesFor('Explorator', 1).find((a) => a.name === 'Tech-Use').cost, 100);
assert.equal(advancesFor('Explorator', 1).find((a) => a.name === 'Security').cost, 200);
assert.equal(advancesFor('Astropath Transcendent', 2).find((a) => a.name === 'Psy Rating 3').cost, 300);
assert.equal(advancesFor('Arch-Militant', 3).find((a) => a.name === 'Swift Attack').prereq, 'WS 35');
assert.equal(advancesFor('Seneschal', 1).find((a) => a.name === 'Seeker of Lore').cost, 200);
assert.equal(advancesFor('Missionary', 1).find((a) => a.name === 'Pure Faith').cost, 500);
assert.equal(advancesFor('Void-Master', 3).find((a) => a.name === 'Ace Pilot').prereq, 'Ag 40, Pilot');
// the Navigator table introduces a fourth advance type
assert.equal(advancesFor('Navigator', 1).find((a) => a.name === 'Navigator Power (Novice)').type, 'Power');
assert.equal(MAX_TABLED_RANK, 4);

// prerequisite parsing
assert.deepEqual(parsePrereq('Int 30'), { chars: [{ key: 'int', min: 30 }], others: [], anyOf: false });
assert.deepEqual(parsePrereq('BS 50').chars, [{ key: 'bs', min: 50 }]);
assert.deepEqual(parsePrereq(null), { chars: [], others: [], anyOf: false });

// "A or B" is an alternative, not two requirements
const either = parsePrereq('BS 30 or WS 30');
assert.equal(either.anyOf, true);
assert.deepEqual(either.chars, [{ key: 'bs', min: 30 }, { key: 'ws', min: 30 }]);

// mixed requirements split into checkable and named halves
const mixed = parsePrereq('WP 30, Command');
assert.deepEqual(mixed.chars, [{ key: 'wp', min: 30 }]);
assert.deepEqual(mixed.others, ['Command']);
assert.deepEqual(parsePrereq('Mechanicus Implants').others, ['Mechanicus Implants']);
assert.deepEqual(parsePrereq('Int 30, Fel 30').chars,
  [{ key: 'int', min: 30 }, { key: 'fel', min: 30 }]);

// unmet characteristic requirements
const totals = { ws: 31, bs: 28, s: 30, t: 35, ag: 29, int: 42, per: 33, wp: 30, fel: 24 };
assert.deepEqual(unmetCharPrereqs('Int 30', totals), [], 'Int 42 meets Int 30');
assert.deepEqual(unmetCharPrereqs('Int 50', totals), [{ key: 'int', min: 50 }]);
assert.deepEqual(unmetCharPrereqs('Fel 30', totals), [{ key: 'fel', min: 30 }], 'Fel 24 fails');
// with "or", meeting either is enough
assert.deepEqual(unmetCharPrereqs('BS 30 or WS 30', totals), [],
  'WS 31 satisfies the alternative even though BS 28 does not');
// and when both halves fail, both are reported
assert.equal(unmetCharPrereqs('BS 60 or WS 60', totals).length, 2);
// named-only prerequisites are never a characteristic failure
assert.deepEqual(unmetCharPrereqs('Mechanicus Implants', totals), []);
assert.deepEqual(unmetCharPrereqs('Int 30', null), []);

/* --- flattening and purchase eligibility ------------------------------- */

const { allAdvances, advanceStatus } = await import('./advances.js');

const expl = allAdvances('Explorator');
assert.equal(allAdvances('Eldar Corsair'), null, 'no table, no list');
// every entry carries the rank it came from, and ranks run 1..4 in order
assert.deepEqual([...new Set(expl.map((a) => a.rank))], [1, 2, 3, 4]);
assert.equal(expl.find((a) => a.name === 'Tech-Use').rank, 1);
assert.equal(expl.find((a) => a.name === 'Tech-Use +10').rank, 2);
// alternate ranks resolve to the base career's list
assert.equal(allAdvances('Explorator (Alternate Rank: Acolyte of Abraxas)').length, expl.length);

const techUse = expl.find((a) => a.name === 'Tech-Use');            // r1, 100
const techUse10 = expl.find((a) => a.name === 'Tech-Use +10');      // r2, 200
const knock = expl.find((a) => a.name === 'Technical Knock');       // r1, 200, Int 30
const rich = { rank: 1, remaining: 500, totals: { int: 42 }, owned: [] };

// affordable, in rank, prerequisite met
let st = advanceStatus(techUse, rich);
assert.equal(st.blocked, false);
assert.equal(st.owned, false);

// a table above your rank is unreachable however much XP you hold
st = advanceStatus(techUse10, { ...rich, remaining: 99999 });
assert.equal(st.lockedByRank, true);
assert.equal(st.blocked, true, 'XP cannot buy past your rank');
// and reachable once the rank catches up
assert.equal(advanceStatus(techUse10, { ...rich, rank: 2 }).lockedByRank, false);

// cannot spend XP you do not have
st = advanceStatus(techUse, { ...rich, remaining: 50 });
assert.equal(st.unaffordable, true);
assert.equal(st.blocked, true);
// exactly enough is enough
assert.equal(advanceStatus(techUse, { ...rich, remaining: 100 }).unaffordable, false);

// an unmet characteristic requirement disqualifies
st = advanceStatus(knock, { ...rich, totals: { int: 25 } });
assert.deepEqual(st.unmetChars, [{ key: 'int', min: 30 }]);
assert.equal(st.blocked, true);
assert.equal(advanceStatus(knock, { ...rich, totals: { int: 30 } }).blocked, false,
  'meeting the minimum exactly is enough');

// named prerequisites are surfaced, not enforced
const logis = expl.find((a) => a.name === 'Logis Implant');   // Mechanicus Implants
st = advanceStatus(logis, rich);
assert.deepEqual(st.namedPrereqs, ['Mechanicus Implants']);
assert.equal(st.blocked, false, 'a named prerequisite must not block the purchase');

// an owned advance is never blocked, so it stays removable even when the
// character could no longer afford or qualify for it
st = advanceStatus(techUse10, { rank: 1, remaining: 0, totals: {}, owned: [{ name: 'Tech-Use +10' }] });
assert.equal(st.owned, true);
assert.equal(st.blocked, false, 'owned advances must remain refundable');

const total = Object.values(CAREER_ADVANCES)
  .reduce((n, ranks) => n + Object.values(ranks).reduce((m, l) => m + l.length, 0), 0);
console.log('advances: all checks passed (%d careers, %d advances)',
  CAREERS_WITH_TABLES.length, total);
