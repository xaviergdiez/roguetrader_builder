// Self-check for patrons.js. Run: node src/patrons.check.mjs
import assert from 'node:assert/strict';
import {
  PATRONS, patronById, extraFor, LIMITLESS_AUTHORITY,
  SUBTLETY_BANDS, SUBTLETY_MAX, subtletyBand, clampSubtlety,
  COMMUNIQUES, SAFEHOUSES, MEETING_PLACES, rollOn,
  STRAYED, strayedById, debriefModifier, EVIDENCE_BONUS, MAX_MODIFIER, DEBRIEF_OUTCOMES,
  readInquisitionJournal, readDebrief, superiorityByFoe, legitimacyTotals
} from './patrons.js';
import { ORDOS } from './inquisition.js';
import { philosophyById } from './philosophies.js';

/* ---- the six Inquisitors of the Macharian Sector ---- */
assert.equal(PATRONS.length, 6);
assert.equal(new Set(PATRONS.map((p) => p.id)).size, 6);
for (const p of PATRONS) {
  assert.ok(ORDOS.some((o) => o.id === p.ordo), p.id + ': unknown Ordo');
  // Every creed resolves to one of the fourteen, so the card can print it.
  assert.ok(philosophyById(p.philosophy), p.id + ': unknown philosophy ' + p.philosophy);
  assert.ok(p.concerns.length >= 2 && p.boons.length >= 2 && p.liabilities.length >= 2, p.id + ' is thin');
  for (const b of [...p.boons, ...p.liabilities]) assert.ok(b.name && b.text, p.id + ': a boon or liability is empty');
  // Limitless Authority is everyone's, so it is said once, not six times.
  assert.equal(p.boons.some((b) => /Limitless/.test(b.name)), false, p.id + ' repeats Limitless Authority');
  // An Inquisitor stands well with the Inquisition: every sheet has it at +2.
  assert.equal(p.influence.Inquisition, 2, p.id);
  assert.equal(p.moreBoons.length, 5);
  assert.equal(p.moreLiabilities.length, 5);
  // Converted: none of Imperium Maledictum's test words are left in the effects.
  for (const b of [...p.boons, ...p.liabilities]) {
    assert.doesNotMatch(b.text, /Advantage|\bSL\b|Discipline \(|Rapport/, `${p.id} ${b.name}: still in Imperium Maledictum's terms`);
  }
}
assert.match(LIMITLESS_AUTHORITY, /Influence with the Inquisition/);
assert.equal(patronById('raud').philosophy, 'xanthism');
assert.equal(patronById('serranus').ordo, 'xenos');
assert.equal(patronById('nobody'), null);
// Halikarn's Abrupt is already counted in his Influence: three Factions at -1, plus the Dynasties.
assert.equal(Object.values(patronById('halikarn').influence).filter((v) => v < 0).length, 4);

// A further boon and liability: the d10, two numbers to a result.
assert.deepEqual(extraFor(patronById('baek'), 1), { boon: 'Clandestine Inquisition Training Facility', liability: 'Corrupt' });
assert.deepEqual(extraFor(patronById('baek'), 2), extraFor(patronById('baek'), 1));
assert.deepEqual(extraFor(patronById('baek'), 10), { boon: 'Psyker Support', liability: 'Warped Visions' });
assert.equal(extraFor(null, 3), null);

/* ---- Subtlety: 10 to 1, four bands, no gaps ---- */
for (let n = 1; n <= SUBTLETY_MAX; n++) {
  assert.equal(SUBTLETY_BANDS.filter((b) => n >= b.from && n <= b.to).length, 1, n + ' lands once');
}
assert.equal(subtletyBand(10).name, 'Covert');
assert.equal(subtletyBand(8).name, 'Covert');
assert.equal(subtletyBand(7).name, 'Suspicious');
assert.equal(subtletyBand(4).name, 'Overt');
assert.equal(subtletyBand(1).name, 'Exposed');
assert.equal(clampSubtlety(0), 10, 'nothing recorded is a fresh, covert cell');
assert.equal(clampSubtlety(-4), 1);
assert.equal(clampSubtlety(42), 10);

/* ---- the briefing tables are d10s ---- */
for (const t of [COMMUNIQUES, SAFEHOUSES, MEETING_PLACES]) assert.equal(t.length, 10);
assert.deepEqual(rollOn(SAFEHOUSES, () => 0), { roll: 1, text: SAFEHOUSES[0] });
assert.deepEqual(rollOn(SAFEHOUSES, () => 0.999), { roll: 10, text: SAFEHOUSES[9] });

/* ---- the debriefing ---- */
assert.equal(EVIDENCE_BONUS, 10, 'the book’s +1 SL a piece');
assert.deepEqual(STRAYED.map((s) => s.mod), [0, -10, -20, -30], 'Challenging to Very Hard');
assert.equal(strayedById('nonsense').id, 'kept');
assert.equal(debriefModifier({ evidence: 3, strayed: 'kept' }), 30);
assert.equal(debriefModifier({ evidence: 3, strayed: 'broke' }), 10);
assert.equal(debriefModifier({ evidence: 0, strayed: 'defied' }), -30);
assert.equal(debriefModifier({ evidence: 12 }), MAX_MODIFIER, 'Rogue Trader caps a test at +60');
assert.equal(debriefModifier({}), 0);
assert.ok(DEBRIEF_OUTCOMES.some((o) => /Superiority/.test(o.text)), 'know thy foe is where Superiority comes from');

/* ---- what the journal stores ---- */
assert.deepEqual(readInquisitionJournal({}), { patron: '', patronName: '', subtlety: 10 });
assert.deepEqual(readInquisitionJournal({ patron: 'horst', subtlety: '6' }), { patron: 'horst', patronName: '', subtlety: 6 });
assert.equal(readInquisitionJournal({ patron: 'drake' }).patron, '', 'not one of the six');

{
  const d = readDebrief({ evidence: 99, strayed: 'bent', superiority: [{ foe: 'Drukhari', points: 2 }, null, 'x'],
    legitimacy: [{ who: 'Vex', gained: 9 }] });
  assert.equal(d.evidence, 20);
  assert.equal(d.strayed, 'bent');
  assert.deepEqual(d.superiority, [{ foe: 'Drukhari', points: 2 }]);
  assert.deepEqual(d.legitimacy, [{ who: 'Vex', gained: 5 }], 'clipped to the house rule’s +2 and some');
  assert.deepEqual(readDebrief(null), { evidence: 0, strayed: 'kept', notes: '', superiority: [], legitimacy: [] });
}

/* ---- Superiority sums by foe across an Endeavour's missions ---- */
{
  const end = { missions: [
    { debrief: { superiority: [{ foe: 'Drukhari', points: 1 }, { foe: ' ', points: 3 }] } },
    { debrief: { superiority: [{ foe: 'Drukhari', points: 2 }, { foe: 'The cult', points: 1 }] } },
    { objectives: [] },
    // the party's copy arrives as it was sent; junk must not throw
    { debrief: { superiority: [{ points: 'x' }] } }
  ] };
  assert.deepEqual(superiorityByFoe(end), { Drukhari: 3, 'The cult': 1 });
  assert.deepEqual(superiorityByFoe(null), {});
}

/* ---- Legitimacy follows a person across every Endeavour ---- */
{
  const ends = [
    { missions: [{ debrief: { legitimacy: [{ who: 'Ilsa Vane', gained: 1 }] } }] },
    { missions: [{ debrief: { legitimacy: [{ who: ' ilsa vane ', gained: 2 }, { who: 'Kor', gained: -1 }, { who: '', gained: 4 }] } }] },
    null
  ];
  assert.deepEqual(legitimacyTotals(ends), [{ who: 'Ilsa Vane', total: 3 }, { who: 'Kor', total: -1 }]);
}

console.log('patrons.js OK (%d patrons)', PATRONS.length);
