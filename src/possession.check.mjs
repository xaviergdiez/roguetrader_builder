// Self-check for possession and forbidden knowledge. Run: node src/possession.check.mjs
import assert from 'node:assert/strict';
import {
  POSSESSION_STAGES, stageFor, takingHold, assertControl, unleash, BOONS, boonById, tensOf, describeStage,
  PUPPET_BONUS, PUPPET_CORRUPTION, POSSESSION_BOOK, puppetPush
} from './possession.js';
import { FORBIDDEN_ORDOS, FORBIDDEN_SOCIETAL, ordoKnowledge, SEVERITIES, FORBIDDEN_PAGE } from './forbidden.js';
import { ORDOS } from './inquisition.js';
import { corruptionTrack } from './sanity.js';

/* ---- the stages: the book’s bands, covering 1-100 once ---- */
{
  assert.deepEqual(POSSESSION_STAGES.map((s) => s.id), ['puppet', 'gateway', 'vessel', 'chosen']);
  assert.deepEqual(POSSESSION_STAGES.map((s) => [s.from, s.to]), [[1, 30], [31, 60], [61, 99], [100, 100]]);
  assert.deepEqual(POSSESSION_STAGES.map((s) => s.mod), [-10, -20, -30, null]);
  assert.equal(stageFor(0), null, 'no Corruption, no possession');
  assert.equal(stageFor(-5), null);
  assert.equal(stageFor(undefined), null);
  assert.equal(stageFor(1).id, 'puppet');
  assert.equal(stageFor(30).id, 'puppet');
  assert.equal(stageFor(31).id, 'gateway');
  assert.equal(stageFor(60).id, 'gateway');
  assert.equal(stageFor(61).id, 'vessel');
  assert.equal(stageFor(99).id, 'vessel');
  assert.equal(stageFor(100).id, 'chosen');
  assert.equal(stageFor(250).id, 'chosen', 'past 100 is still the Chosen');
  for (let c = 1; c <= 100; c++) assert.ok(stageFor(c), `a stage for ${c}`);
  assert.match(describeStage(45), /Gateway.*Hard/);
  assert.equal(describeStage(0), 'not possessed');
  // The bands sit on the Corruption track’s own steps (Soiled at 31, Debased at 61, Damned at 100).
  assert.equal(corruptionTrack(31).degree, 'Soiled');
  assert.equal(corruptionTrack(61).degree, 'Debased');
  assert.equal(corruptionTrack(100).damned, true);
  assert.ok(/Inquisition GM/.test(POSSESSION_BOOK));
}

/* ---- the daemon asserts control ---- */
{
  assert.equal(takingHold(7, 9), 16, '2d10');
  assert.equal(PUPPET_BONUS, 20);
  assert.equal(PUPPET_CORRUPTION, 2);
  assert.equal(assertControl({ willpower: 50, corruption: 0, roll: 10 }), null, 'not possessed');

  // Puppet, Willpower 50: target 50-10 = 40.
  const win = assertControl({ willpower: 50, corruption: 20, roll: 30 });
  assert.equal(win.target, 40);
  assert.equal(win.resisted, true);
  assert.equal(win.rounds, 0);
  assert.equal(win.corruptionGained, 0);
  // fails by 25: 2 degrees. 1d5 rolled 3 + 2 = 5 rounds, 2 Corruption.
  const lose = assertControl({ willpower: 50, corruption: 20, roll: 65, d5: 3 });
  assert.equal(lose.resisted, false);
  assert.equal(lose.degrees, 2);
  assert.equal(lose.rounds, 5, '1d5 and one for every degree of failure');
  assert.equal(lose.corruptionGained, 2, 'one Corruption per degree');
  // a close failure costs no Corruption but still loses the rounds
  const close = assertControl({ willpower: 50, corruption: 20, roll: 45, d5: 2 });
  assert.equal(close.resisted, false);
  assert.equal(close.degrees, 0);
  assert.equal(close.rounds, 2);
  assert.equal(close.corruptionGained, 0);

  // Harder deeper in.
  assert.equal(assertControl({ willpower: 50, corruption: 40, roll: 10 }).target, 30, 'Gateway -20');
  assert.equal(assertControl({ willpower: 50, corruption: 80, roll: 10 }).target, 20, 'Vessel -30');
  assert.equal(assertControl({ willpower: 50, corruption: 20, roll: 10, otherMod: 10 }).target, 50, 'a table modifier');
  // 96+ always fails and 01-05 always passes, like every test here.
  assert.equal(assertControl({ willpower: 90, corruption: 20, roll: 97 }).resisted, false);
  assert.equal(assertControl({ willpower: 5, corruption: 80, roll: 3 }).resisted, true);

  const chosen = assertControl({ willpower: 90, corruption: 100, roll: 1 });
  assert.equal(chosen.auto, true, 'the Chosen cannot resist');
  assert.equal(chosen.resisted, false);
  assert.equal(chosen.roll, null);
}

/* ---- the Puppet\u2019s push ---- */
{
  assert.deepEqual(puppetPush({ willpower: 50, roll: 80 }), { roll: 80, target: 50, resisted: false, degrees: 3, bonus: 20, corruptionGained: 2 }, 'failing pays the full 2');
  assert.equal(puppetPush({ willpower: 50, roll: 45 }).corruptionGained, 2, 'a bare pass takes nothing off');
  assert.equal(puppetPush({ willpower: 50, roll: 40 }).corruptionGained, 1, 'one degree takes one off');
  assert.equal(puppetPush({ willpower: 50, roll: 30 }).corruptionGained, 0, 'two or more takes it all');
  assert.equal(puppetPush({ willpower: 50, roll: 3 }).corruptionGained, 0, 'and never below nothing');
}

/* ---- drawing on the daemon ---- */
{
  assert.equal(BOONS.length, 3);
  assert.equal(boonById('vitality').id, 'vitality');
  assert.equal(boonById('x'), null);
  assert.equal(tensOf(47), 4);
  assert.equal(tensOf(5), 0);
  assert.equal(unleash({ willpower: 50, corruption: 0, roll: 10 }), null);

  // success: Willpower 60, Gateway (-20) target 40, roll 20. Wounds back = WilB 6 + tens of 45 = 4 = 10.
  const ok = unleash({ willpower: 60, corruption: 45, roll: 20, boon: 'vitality' });
  assert.equal(ok.success, true);
  assert.equal(ok.target, 40);
  assert.equal(ok.amount, 10);
  assert.equal(ok.unit, 'Wounds');
  assert.equal(ok.corruptionDie, 5, 'the daemon is paid 1d5');
  assert.equal(ok.takeover, null);
  const talent = unleash({ willpower: 60, corruption: 45, roll: 20, boon: 'talent' });
  assert.equal(talent.amount, 10);
  assert.equal(talent.unit, 'hours');
  const skill = unleash({ willpower: 60, corruption: 45, roll: 20, boon: 'skill' });
  assert.equal(skill.amount, 20);
  assert.equal(skill.unit, 'to the test');

  // failure: the boon for one action, then the daemon has the wheel.
  const bad = unleash({ willpower: 60, corruption: 45, roll: 80, d5: 4, boon: 'skill' });
  assert.equal(bad.success, false);
  assert.equal(bad.degrees, 4);
  assert.deepEqual(bad.takeover, { rounds: 8, corruptionGained: 4 });

  const c = unleash({ willpower: 60, corruption: 100, roll: 1 });
  assert.equal(c.auto, true);
  assert.equal(c.success, false);
}

/* ---- forbidden knowledge ---- */
{
  assert.equal(FORBIDDEN_PAGE, 78);
  assert.deepEqual(FORBIDDEN_ORDOS.map((o) => o.id), ORDOS.map((o) => o.id), 'one entry for each Ordo the app already has');
  for (const o of FORBIDDEN_ORDOS) {
    for (const k of ['minor', 'major', 'negative', 'positive']) assert.ok(o[k] && o[k].length > 30 && o[k].length < 400, `${o.id}.${k}`);
    assert.equal(ordoKnowledge(o.id), o);
  }
  assert.equal(ordoKnowledge('nope'), null);
  assert.deepEqual(SEVERITIES, ['minor', 'major']);
  assert.equal(FORBIDDEN_SOCIETAL.length, 2);
  assert.match(FORBIDDEN_ORDOS[1].major, /summon and bind daemons/);
}

console.log('possession.check.mjs: all assertions passed');
