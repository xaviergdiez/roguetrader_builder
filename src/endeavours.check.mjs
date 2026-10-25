// Self-check for the Endeavour journal. Run: node src/endeavours.check.mjs
import assert from 'node:assert/strict';
import {
  OBJECTIVE_KINDS, kindById, STATUSES, statusById,
  EMPTY_ENDEAVOUR, readObjective, readMission, readEndeavour, readLibrary,
  newEndeavour, newMission, newObjective,
  objectiveTarget, objectiveComplete, missionProgress, endeavourProgress,
  describeEndeavour, encounterIdsIn
,
  nameOf, endeavourName, missionName, objectiveName} from './endeavours.js';

/* ---- the vocabulary ---- */

{
  const ids = OBJECTIVE_KINDS.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate objective kind');
  for (const k of OBJECTIVE_KINDS) assert.ok(k.id && k.name && k.note, k.id + ' incomplete');
  assert.ok(ids.includes('combat'), 'a campaign has fights');
  assert.ok(ids.includes('investigation'), 'and investigations');
  assert.ok(ids.includes('puzzle'), 'and things solved rather than rolled');
  assert.equal(kindById('combat').name, 'Combat');
  assert.equal(kindById('nope'), null);

  assert.equal(statusById('active').name, 'Under way');
  // An unknown status falls back rather than vanishing from the dropdown.
  assert.equal(statusById('nonsense').id, 'planned');
  assert.equal(statusById(undefined).id, 'planned');
}

/* ---- a name is kept exactly as it was typed ---- */

{
  // THE BUG THIS PREVENTS: these read functions run on every keystroke,
  // because an edit rebuilds the whole Endeavour and hands it back through
  // readEndeavour. A default applied HERE does not fill a blank field — it
  // overwrites the GM mid-sentence, putting "Endeavour" back under the
  // cursor the moment they clear the field to retype it.
  assert.equal(readEndeavour({ name: '' }).name, '');
  assert.equal(readMission({ name: '' }).name, '');
  assert.equal(readObjective({ name: '' }).name, '');
  assert.equal(readEndeavour({}).name, '');

  // Clearing the field and typing again survives the round trip, one
  // keystroke at a time, with nothing injected in front of what was typed.
  let end = readEndeavour({ name: 'Endeavour 1' });
  end = readEndeavour({ ...end, name: '' });           // select-all, delete
  assert.equal(end.name, '');
  for (const ch of 'Endeavour test') {
    end = readEndeavour({ ...end, name: end.name + ch });
  }
  assert.equal(end.name, 'Endeavour test', 'the typed name arrived intact');

  // A name the GM did set is still kept, and still trimmed to length.
  assert.equal(readEndeavour({ name: 'The Cloud-Fane' }).name, 'The Cloud-Fane');
  assert.equal(readEndeavour({ name: 'x'.repeat(500) }).name.length, 120);
  assert.equal(readEndeavour({ name: null }).name, '');
  assert.equal(readEndeavour({ name: 42 }).name, '42');

  // The fallback lives at display time instead, which is the only place it
  // was ever wanted.
  assert.equal(endeavourName({ name: '' }), 'Untitled endeavour');
  assert.equal(endeavourName({ name: '   ' }), 'Untitled endeavour', 'blanks are not a name');
  assert.equal(endeavourName({ name: 'The Cloud-Fane' }), 'The Cloud-Fane');
  assert.equal(endeavourName(null), 'Untitled endeavour');
  assert.equal(missionName({ name: '' }), 'Untitled mission');
  assert.equal(objectiveName({ name: '' }), 'Untitled objective');
  assert.equal(nameOf({ name: 'Kept' }, 'fallback'), 'Kept');
}

/* ---- reading a stored blob ---- */

{
  for (const junk of [undefined, null, 0, 'no', [], { missions: 'no' }]) {
    const e = readEndeavour(junk);
    assert.ok(e.id && typeof e.name === 'string' && Array.isArray(e.missions));
    assert.equal(e.status, 'planned');
  }
  assert.deepEqual(readEndeavour({ missions: [null, 3, 'x'] }).missions, []);
  assert.deepEqual(readLibrary(null), []);
  assert.equal(readLibrary([{}, {}]).length, 2);

  // Ids are kept when present and minted when not, so editing does not fork.
  assert.equal(readEndeavour({ id: 'end-keep' }).id, 'end-keep');
  assert.ok(readEndeavour({}).id.startsWith('end-'));
  assert.ok(readMission({}).id.startsWith('mis-'));
  assert.ok(readObjective({}).id.startsWith('obj-'));

  // An unknown kind becomes 'other' rather than rendering as a blank chip.
  assert.equal(readObjective({ kind: 'telepathy' }).kind, 'other');
  assert.equal(readObjective({ kind: 'combat' }).kind, 'combat');

  // Numbers never come back negative or NaN.
  const o = readObjective({ achievementPoints: '-40', earned: 'x' });
  assert.equal(o.achievementPoints, 0);
  assert.equal(o.earned, 0);
  assert.equal(readObjective({ achievementPoints: '250' }).achievementPoints, 250);

  // The modifier IS allowed to be negative — an Endeavour can be made easier
  // as well as harder — while a reward never is.
  assert.equal(readEndeavour({ apModifier: -20 }).apModifier, -20);
  assert.equal(readEndeavour({ profitFactorReward: -5 }).profitFactorReward, 0);

  // Nesting survives a round trip.
  const nested = readEndeavour({
    name: 'The Cloud-Fane', status: 'active',
    missions: [{ name: 'Make planetfall', objectives: [
      { kind: 'exploration', name: 'Chart the approach', achievementPoints: 100 },
      { kind: 'combat', name: 'The welcome', achievementPoints: 150, encounterId: 'enc-1' }
    ] }]
  });
  assert.equal(nested.missions.length, 1);
  assert.equal(nested.missions[0].objectives.length, 2);
  assert.equal(nested.missions[0].objectives[1].encounterId, 'enc-1');
  assert.deepEqual(readEndeavour(nested), nested, 'reading twice changes nothing');
}

/* ---- an objective is complete when it is complete, and not before ---- */

{
  const obj = (over) => readObjective({ achievementPoints: 100, ...over });

  assert.equal(objectiveComplete(obj({ earned: 0 })), false);
  assert.equal(objectiveComplete(obj({ earned: 99 })), false);
  assert.equal(objectiveComplete(obj({ earned: 100 })), true);
  assert.equal(objectiveComplete(obj({ earned: 250 })), true);

  // Marked done by hand beats the arithmetic. A tracker that argues with the
  // GM about whether something happened is worse than no tracker.
  assert.equal(objectiveComplete(obj({ earned: 0, done: true })), true);

  // An Objective carrying NO points is not instantly complete. This is the
  // one that matters: every Objective starts at 0, and a naive
  // earned >= target would mark a brand-new Endeavour finished.
  assert.equal(objectiveComplete(readObjective({})), false,
    'a fresh objective must not read as already done');
  assert.equal(objectiveTarget(readObjective({})), 0);

  // The Endeavour's modifier raises every target — Finances in Arrears.
  assert.equal(objectiveTarget(obj({}), 50), 150);
  assert.equal(objectiveComplete(obj({ earned: 100 }), 50), false,
    '100 earned against a 150 target is not done');
  assert.equal(objectiveComplete(obj({ earned: 150 }), 50), true);

  // And a negative modifier lowers them, without going below zero.
  assert.equal(objectiveTarget(obj({}), -40), 60);
  assert.equal(objectiveTarget(obj({}), -500), 0);
}

/* ---- progress rolls up ---- */

{
  const end = readEndeavour({
    name: 'Break the Cult of the Pale Star',
    missions: [
      { name: 'Find the cell', objectives: [
        { kind: 'investigation', name: 'Canvass the undercity', achievementPoints: 100, earned: 100 },
        { kind: 'social', name: 'Lean on the magistrate', achievementPoints: 100, earned: 40 }
      ] },
      { name: 'Burn it out', objectives: [
        { kind: 'combat', name: 'The shrine', achievementPoints: 200, earned: 0, encounterId: 'enc-shrine' }
      ] }
    ]
  });

  const p = endeavourProgress(end);
  assert.equal(p.earned, 140);
  assert.equal(p.target, 400);
  assert.equal(p.objectives, 3);
  assert.equal(p.doneObjectives, 1);
  assert.equal(p.missions, 2);
  assert.equal(p.doneMissions, 0, 'one of two objectives done is not a done mission');
  assert.equal(p.complete, false);
  assert.ok(Math.abs(p.fraction - 0.35) < 1e-9);

  // Finishing the second objective finishes the first mission, and only it.
  end.missions[0].objectives[1].earned = 100;
  const p2 = endeavourProgress(end);
  assert.equal(p2.doneMissions, 1);
  assert.equal(p2.complete, false);

  // Finishing everything finishes the Endeavour.
  end.missions[1].objectives[0].done = true;
  const p3 = endeavourProgress(end);
  assert.equal(p3.doneMissions, 2);
  assert.equal(p3.doneObjectives, 3);
  assert.equal(p3.complete, true);

  // The fraction is capped: overshooting a target does not read as 140%.
  end.missions[1].objectives[0].earned = 10000;
  assert.equal(endeavourProgress(end).fraction, 1);

  // An empty Endeavour is not a complete one, and reports no fraction at all
  // rather than a full bar nobody earned.
  const blank = endeavourProgress(readEndeavour({}));
  assert.equal(blank.complete, false);
  assert.equal(blank.fraction, null);
  assert.equal(blank.target, 0);

  // A mission with objectives but no points still completes by hand.
  const byHand = readMission({ objectives: [{ name: 'A conversation', done: true }] });
  assert.equal(missionProgress(byHand).complete, true);
  assert.equal(missionProgress(byHand).fraction, null,
    'no points set means no bar to draw');
}

/* ---- the modifier reaches the roll-up, not just one objective ---- */

{
  const base = {
    missions: [{ objectives: [
      { achievementPoints: 100, earned: 100 },
      { achievementPoints: 100, earned: 100 }
    ] }]
  };
  const plain = endeavourProgress(readEndeavour(base));
  assert.equal(plain.complete, true, 'both objectives met their targets');

  const indebted = endeavourProgress(readEndeavour({ ...base, apModifier: 50 }));
  assert.equal(indebted.target, 300, 'fifty more on each of two objectives');
  assert.equal(indebted.complete, false,
    'Finances in Arrears must put the Endeavour back out of reach');
}

/* ---- the line a list prints ---- */

{
  assert.equal(describeEndeavour(readEndeavour({})), 'nothing planned yet');
  const e = readEndeavour({ missions: [{ objectives: [
    { achievementPoints: 50, earned: 50 }, { achievementPoints: 50 }
  ] }] });
  const line = describeEndeavour(e);
  assert.match(line, /0\/1 missions/);
  assert.match(line, /1\/2 objectives/);
  assert.match(line, /50\/100 AP/);
  assert.equal(line.includes('undefined'), false);
}

/* ---- the join to the encounter library ---- */

{
  const e = readEndeavour({ missions: [
    { objectives: [{ kind: 'combat', encounterId: 'enc-a' }, { kind: 'social' }] },
    { objectives: [{ kind: 'combat', encounterId: 'enc-b' }] }
  ] });
  assert.deepEqual(encounterIdsIn(e), ['enc-a', 'enc-b']);
  assert.deepEqual(encounterIdsIn(readEndeavour({})), []);
  assert.deepEqual(encounterIdsIn(null), []);
}

/* ---- the constructors produce something readable ---- */

{
  const e = newEndeavour('A Warrant Honoured');
  assert.equal(e.name, 'A Warrant Honoured');
  assert.equal(e.status, 'planned');
  assert.deepEqual(e.missions, []);
  // Already in stored form, so saving one straight off does not reshape it.
  assert.deepEqual(readEndeavour(e), e);

  const m = newMission('Make planetfall');
  assert.equal(m.name, 'Make planetfall');
  assert.deepEqual(readMission(m), m);

  assert.equal(newObjective('combat').kind, 'combat');
  assert.equal(newObjective().kind, 'other');
  const o = newObjective('puzzle', 'The sealed vault');
  assert.deepEqual(readObjective(o), o, 'a fresh objective is already in stored form');

  // Every fresh id is distinct, or two new missions would collide in a list.
  const ids = new Set(Array.from({ length: 50 }, () => newMission().id));
  assert.equal(ids.size, 50, 'fresh ids must not repeat');
}

{
  const { readScenario, redactEndeavour: red, subplotMessage, SCENARIO_CONCEPTS } = await import('./endeavours.js');
  assert.equal(readMission({ name: 'plain' }).scenario, undefined, 'a plain Mission is unchanged');
  const e = readEndeavour({ missions: [{ name: 'Deal', scenario: {
    concept: "It's a Deal", conflict: 'person',
    sides: [{ name: 'Crew' }, { name: 'Buyers' }, { name: 'Pirates' }],
    subplots: [{ charId: 'c1', text: 'Sell the cargo twice.' }, { text: 'orphan' }]
  }, objectives: [{ name: 'Meet' }] }] });
  const sc = e.missions[0].scenario;
  assert.equal(sc.sides.length, 3);
  assert.equal(sc.conflict, 'person');
  assert.equal(readScenario({ conflict: 'nonsense' }).conflict, 'situation');
  assert.deepEqual(readEndeavour(e), e, 'a scenario survives a round trip');
  assert.equal(red(e, { isGm: true }).missions[0].scenario.subplots.length, 2);
  const seen = red(e, { isGm: false }).missions[0].scenario;
  assert.equal(seen.subplots.length, 0, 'players never receive the sub-plots');
  assert.equal(seen.concept, "It's a Deal");
  assert.equal(subplotMessage(e.missions[0], sc.subplots[0]).to, 'c1');
  assert.equal(subplotMessage(e.missions[0], sc.subplots[1]), null, 'no character, nowhere to send it');
  assert.ok(SCENARIO_CONCEPTS.includes('Stowaway'));

  const { readDiary, withDiaryEntry } = await import('./endeavours.js');
  const e0 = readEndeavour({ name: 'E', missions: [{ name: 'M', objectives: [{ name: 'o' }] }] });
  assert.equal(e0.diary, undefined, 'no diary until there is one');
  const e1 = withDiaryEntry(e0, { title: 'Session 1', text: 'Grak: Survived', xp: 500 });
  assert.equal(e1.diary.length, 1);
  assert.equal(e1.diary[0].xp, 500);
  assert.deepEqual(readEndeavour(e1), e1, 'a diary survives a round trip');
  assert.equal(red(e1, { isGm: true }).diary.length, 1);
  assert.equal(red(e1, { isGm: false }).diary, undefined, "the diary is the GM's");
  assert.equal(readDiary([null, 3, { text: 'x', xp: -5 }])[0].xp, 0);
}
console.log('endeavours.js OK (%d objective kinds, %d statuses)',
  OBJECTIVE_KINDS.length, STATUSES.length);
