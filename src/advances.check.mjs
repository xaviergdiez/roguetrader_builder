// Self-check for the career advance tables. Run: node src/advances.check.mjs
import assert from 'node:assert/strict';
import {
  CAREER_ADVANCES, CAREERS_WITH_TABLES, advancesFor, baseCareer,
  parsePrereq, unmetCharPrereqs, MAX_TABLED_RANK
} from './advances.js';

// four careers have published tables here
assert.deepEqual(CAREERS_WITH_TABLES.sort(),
  ['Arch-Militant', 'Astropath Transcendent', 'Explorator', 'Rogue Trader']);

// every career covers ranks 1-4, and every entry is well formed — a typo in a
// cost or type would otherwise pass silently into the UI
for (const [career, ranks] of Object.entries(CAREER_ADVANCES)) {
  assert.deepEqual(Object.keys(ranks).map(Number), [1, 2, 3, 4], career + ': ranks');
  for (const [rank, list] of Object.entries(ranks)) {
    assert.ok(list.length, career + ' rank ' + rank + ' is empty');
    for (const a of list) {
      const where = `${career} r${rank} ${a.name}`;
      assert.ok(a.name && typeof a.name === 'string', where + ': name');
      assert.ok(['Skill', 'Talent', 'Technique'].includes(a.type), where + ': type ' + a.type);
      assert.ok(Number.isInteger(a.cost) && a.cost > 0, where + ': cost');
      assert.ok(a.prereq === null || typeof a.prereq === 'string', where + ': prereq');
    }
  }
}

// a career with no table is distinguishable from a rank with no entries
assert.equal(advancesFor('Seneschal', 1), null, 'no published table yet');
assert.equal(advancesFor('Navigator', 1), null);
assert.ok(Array.isArray(advancesFor('Explorator', 1)));
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

const total = Object.values(CAREER_ADVANCES)
  .reduce((n, ranks) => n + Object.values(ranks).reduce((m, l) => m + l.length, 0), 0);
console.log('advances: all checks passed (%d careers, %d advances)',
  CAREERS_WITH_TABLES.length, total);
