// Self-check for the encounter builder. Run: node src/encounters.check.mjs
import assert from 'node:assert/strict';
import {
  SOAK_WEIGHT, BASELINE_SKILL, BASELINE_PC,
  threatWeight, hostileWeight, tierWeight, encounterWeight,
  partyMemberWeight, partyWeight, DIFFICULTY_BANDS, difficulty,
  MAX_HOSTILES, EMPTY_ENCOUNTER, readEncounter, readHostile, readLibrary,
  newEncounter, toNpcAdd, draftsFromSystem, describeEncounter, stockDraft, isUnweighed
} from './encounters.js';
import { indexToNpc } from './bestiaryindex.js';
import { THREAT_TIERS, tierById, rollNpc, bestiaryToNpc, BESTIARY } from './npcgen.js';
import { rollSystem, featureById } from './stargen.js';
import { applyGroundEvent, groundEventById } from './groundcombat.js';

const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed % 100000) / 100000;
};

/* ---- the weight formula behaves ---- */

{
  // Nothing at all weighs nothing.
  assert.equal(threatWeight(), 0);
  assert.equal(threatWeight({}), 0);

  // Wounds alone, at the baseline skill, weigh themselves.
  assert.equal(threatWeight({ wounds: 10, ws: BASELINE_SKILL }), 10);

  // A point of soak is worth SOAK_WEIGHT Wounds, and armour and Toughness
  // Bonus count the same — both subtract from every hit.
  assert.equal(threatWeight({ wounds: 10, armour: 1, ws: BASELINE_SKILL }), 10 + SOAK_WEIGHT);
  assert.equal(threatWeight({ wounds: 10, toughnessBonus: 1, ws: BASELINE_SKILL }),
    10 + SOAK_WEIGHT);

  // Skill scales the whole thing: twice the baseline is twice the threat.
  assert.equal(threatWeight({ wounds: 10, ws: BASELINE_SKILL * 2 }), 20);
  // The better of the two skills is the one that counts — a marksman is not
  // made harmless by being poor in melee.
  assert.equal(threatWeight({ wounds: 10, ws: 0, bs: BASELINE_SKILL * 2 }), 20);
  assert.equal(threatWeight({ wounds: 10, ws: BASELINE_SKILL * 2, bs: 5 }), 20);

  // Something with no skill on file still soaks damage, so it is not free.
  assert.ok(threatWeight({ wounds: 10 }) > 0, 'a statless hostile still weighs something');
  assert.ok(threatWeight({ wounds: 10 }) < threatWeight({ wounds: 10, ws: BASELINE_SKILL }));

  // Rubbish in does not come back negative or NaN.
  for (const bad of [{ wounds: -5 }, { wounds: 'x' }, { wounds: 10, armour: -3 },
                     { wounds: null, ws: undefined }]) {
    const w = threatWeight(bad);
    assert.ok(Number.isFinite(w) && w >= 0, 'bad input produced ' + w);
  }
}

/* ---- the tiers come out in the order they are meant to ---- */

{
  const weights = THREAT_TIERS.map((t) => tierWeight(t.id));
  for (let i = 1; i < weights.length; i++) {
    assert.ok(weights[i] > weights[i - 1],
      `${THREAT_TIERS[i].name} should outweigh ${THREAT_TIERS[i - 1].name}`
      + ` (${weights[i]} vs ${weights[i - 1]})`);
  }
  assert.equal(tierWeight('nonsense'), 0);
  assert.equal(tierWeight(null), 0);

  // A Named antagonist is worth several Minor ones, not a hundred.
  const ratio = tierWeight('named') / tierWeight('minor');
  assert.ok(ratio > 2 && ratio < 12, 'Named/Minor ratio is ' + ratio.toFixed(1));
}

/* ---- a rolled hostile and a bestiary entry both weigh ---- */

{
  for (let seed = 1; seed < 150; seed++) {
    const npc = rollNpc({ rng: seeded(seed) });
    const w = hostileWeight(npc);
    assert.ok(Number.isFinite(w) && w > 0, 'a rolled hostile weighed ' + w);
  }
  // An entry with no usable numbers must not throw, and must weigh NOTHING
  // rather than a token amount: one the GM has to adjudicate by hand cannot
  // be reckoned for them, and a token weight was worse than none because it
  // made an unstatted encounter read as Trivial.
  // Built here rather than taken from the bestiary: every entry in it has
  // numbers now, and this is about what happens to one that does not.
  const vague = readHostile({ name: 'Something unstatted', custom: true });
  assert.equal(vague.ws, null);
  assert.equal(isUnweighed(vague), true);
  assert.equal(hostileWeight(vague), 0,
    'an entry with nothing on it cannot be weighed, and must not pretend to be');

  const kaptin = bestiaryToNpc('Kaptin Orlog Mordakka');
  assert.ok(hostileWeight(kaptin) > hostileWeight(vague));
}

/* ---- the party side uses the same formula ---- */

{
  // A member who has published nothing is still a body in the fight.
  const unknown = partyMemberWeight({});
  assert.ok(unknown > 0, 'an unpublished character still counts');
  assert.equal(unknown, threatWeight(BASELINE_PC));

  // A published card is weighed from its own numbers.
  const published = partyMemberWeight({
    card: { characteristics: { ws: 50, bs: 30, t: 45 } },
    vitals: { max: 16 }
  });
  assert.ok(published > unknown, 'a capable character outweighs the baseline');

  // Real Wounds off the shared ship beat the baseline guess.
  const hurtIsNotWeaker = partyMemberWeight({ vitals: { max: 20 } });
  assert.ok(hurtIsNotWeaker > unknown, 'more Wounds means more weight');

  assert.equal(partyWeight([]), 0);
  assert.equal(partyWeight(null), 0);
  assert.equal(partyWeight([{}, {}, {}]), unknown * 3);
}

/* ---- difficulty ---- */

{
  // Bands are ordered hardest first, so the first match wins. Out of order
  // and every ratio would come back Deadly.
  for (let i = 1; i < DIFFICULTY_BANDS.length; i++) {
    assert.ok(DIFFICULTY_BANDS[i].min < DIFFICULTY_BANDS[i - 1].min,
      'bands must descend');
  }
  assert.equal(DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1].min, 0,
    'the gentlest band has to catch everything left');

  const party = [{}, {}, {}, {}];          // four baseline Explorers
  const encOf = (tierId, n) => ({
    hostiles: Array.from({ length: n }, () => {
      const t = tierById(tierId);
      const mid = ([a, b]) => Math.round((a + b) / 2);
      return { name: t.name, max: mid(t.wounds), armour: mid(t.armour),
        toughnessBonus: Math.floor(mid(t.t) / 10), ws: mid(t.wsBs), bs: mid(t.wsBs) };
    })
  });

  // An empty encounter has no difficulty to report.
  assert.equal(difficulty({ hostiles: [] }, party), null);
  assert.equal(difficulty(null, party), null);

  // Four Explorers against four Minor hostiles should not be a real fight;
  // against the same number of Named ones it very much should be.
  const easy = difficulty(encOf('minor', 4), party);
  const awful = difficulty(encOf('named', 4), party);
  assert.ok(easy.ratio < awful.ratio);
  assert.ok(['trivial', 'straightforward'].includes(easy.band.id),
    'four Minor hostiles came out ' + easy.band.id + ' at ratio ' + easy.ratio.toFixed(2));
  assert.equal(awful.band.id, 'deadly',
    'four Named antagonists came out ' + awful.band.id + ' at ratio ' + awful.ratio.toFixed(2));

  // Adding bodies to the party makes the same encounter easier, monotonically.
  const fixed = encOf('heavy', 5);
  let last = Infinity;
  for (let n = 2; n <= 8; n++) {
    const r = difficulty(fixed, Array.from({ length: n }, () => ({}))).ratio;
    assert.ok(r < last, 'a bigger party should face a lower ratio');
    last = r;
  }

  // Every band is reachable by some honest number of Heavies against four.
  const reached = new Set();
  for (let n = 1; n <= 40; n++) {
    const dres = difficulty(encOf('heavy', n), party);
    if (dres && dres.band) reached.add(dres.band.id);
  }
  for (const b of DIFFICULTY_BANDS) {
    assert.ok(reached.has(b.id), b.id + ' is unreachable and so is dead advice');
  }

  // Nobody to weigh against: the threat is real, the ratio is withheld
  // rather than divided by zero.
  const noParty = difficulty(encOf('heavy', 2), []);
  assert.ok(noParty.threat > 0);
  assert.equal(noParty.ratio, null);
  assert.equal(noParty.band, null);
}

/* ---- a creature with no numbers is not weighed as though it had some ---- */

// A placeholder from the page index arrives named and cited and nothing
// else, because the index carries no characteristics. Counting it as the
// one Wound it was created with reported "Trivial 0.01x" for an encounter
// nobody had statted yet — which is worse than reporting nothing, because
// it looks like an answer.
{
  const ph = readHostile(indexToNpc('Abomination'));
  assert.equal(ph.custom, true, 'the placeholder must declare itself');
  assert.match(ph.note, /p\. \d+/, 'and keep its citation through storage');
  assert.equal(isUnweighed(ph), true);
  assert.equal(hostileWeight(ph), 0, 'nothing to go on means no weight');

  // An encounter of nothing but placeholders withholds the band and says
  // how many are unstatted.
  const blank = difficulty({ hostiles: [ph, ph] }, [{}, {}, {}, {}]);
  assert.equal(blank.threat, 0);
  assert.equal(blank.band, null, 'no band for a fight nobody has statted');
  assert.equal(blank.ratio, null);
  assert.equal(blank.unweighed, 2);

  // Mixed: the statted half is weighed, the rest is reported separately so
  // the GM knows the band is incomplete.
  const brute = readHostile({ name: 'Brute', max: 15, ws: 40, armour: 4, toughnessBonus: 4 });
  const mixed = difficulty({ hostiles: [ph, brute] }, [{}, {}, {}, {}]);
  assert.ok(mixed.band, 'a partly statted encounter still bands what it can');
  assert.equal(mixed.unweighed, 1);
  assert.equal(mixed.threat, hostileWeight(brute), 'only the statted one counts');

  // THE TRAP: Number(null) is 0 and 0 is finite, so a finiteness test reads
  // "no skill on file" as "a skill of zero" and weighs the placeholder after
  // all. Pinned because it is invisible until a GM trusts the band.
  assert.equal(isUnweighed(readHostile({ custom: true, ws: null, bs: null })), true);
  // The bestiary spells "no figure on file" as 0, the way the printed dash
  // does, so a custom entry full of zeros is as unweighable as one full of
  // nulls. Both halves of the app are covered by one test.
  assert.equal(isUnweighed(readHostile({ custom: true, ws: 0, bs: 0 })), true,
    'zeros mean the same thing as nulls here');
  // But a creature that only shoots is weighed on what it has.
  assert.equal(isUnweighed(readHostile({ custom: true, ws: 0, bs: 64 })), false,
    'no Weapon Skill is not no numbers');
  // And nothing non-custom is ever skipped, however poor its line.
  assert.equal(isUnweighed(readHostile({ ws: 0, bs: 0 })), false);

  // Flagged custom but statted anyway — a bestiary entry that has numbers —
  // is weighed normally.
  const named = readHostile({ name: 'Named', max: 40, ws: 55, custom: true });
  assert.equal(isUnweighed(named), false);
  assert.ok(hostileWeight(named) > 0);

  // A placeholder still reaches the board; it is the GM's to fill in.
  assert.equal(toNpcAdd(ph).id, 'npc_add');
  assert.equal(toNpcAdd(ph).name, 'Abomination');
}

/* ---- the stored shape survives a hand-edited blob ---- */

{
  for (const junk of [undefined, null, 0, 'nope', [], { hostiles: 'no' }]) {
    const e = readEncounter(junk);
    assert.ok(e.id && typeof e.name === 'string' && Array.isArray(e.hostiles));
  }
  assert.deepEqual(readEncounter({ hostiles: [null, 1, 'x'] }).hostiles, []);

  // An id is kept when it is there and minted when it is not, so saving
  // twice does not fork one encounter into two.
  assert.equal(readEncounter({ id: 'enc-keep' }).id, 'enc-keep');
  assert.ok(readEncounter({}).id.startsWith('enc-'));

  // A library that grew past the ceiling is trimmed rather than refused.
  const huge = { hostiles: Array.from({ length: MAX_HOSTILES + 10 }, () => ({ name: 'x' })) };
  assert.equal(readEncounter(huge).hostiles.length, MAX_HOSTILES);

  assert.deepEqual(readLibrary(null), []);
  assert.deepEqual(readLibrary('x'), []);
  assert.equal(readLibrary([{}, {}]).length, 2);

  // Numbers come back as numbers, and a missing one stays null rather than
  // becoming 0 — npc_add treats null as "not on file" and 0 as "no armour".
  const h = readHostile({ name: 'Brute', max: '14', armour: null, ws: '40' });
  assert.equal(h.max, 14);
  assert.equal(h.ws, 40);
  assert.equal(h.armour, null, 'absent armour must not become 0');
  assert.equal(h.agilityBonus, 3, 'an absent Agility Bonus defaults to average');
  assert.equal(readHostile({}).name, 'Hostile');
  assert.equal(readHostile({ max: -5 }).max, 1, 'a hostile has at least one Wound');

  const fresh = newEncounter('Boarding party');
  assert.equal(fresh.name, 'Boarding party');
  assert.deepEqual(fresh.hostiles, []);
}

/* ---- pushing to the board ---- */

{
  // The whole point of storing hostiles in npc_add's shape: the event the
  // board already accepts takes them unchanged. If this drifts, a saved
  // encounter would push hostiles the board quietly strips fields from.
  const def = groundEventById('npc_add');
  assert.ok(def, 'npc_add must exist for an encounter to be pushable');

  const enc = readEncounter({
    name: 'Ambush',
    hostiles: [{ name: 'Krump', max: 15, ws: 40, bs: 28, toughnessBonus: 4,
      armour: 4, weapon: 'chainsword', agilityBonus: 2 }]
  });
  const event = toNpcAdd(enc.hostiles[0], enc.name);
  assert.equal(event.id, 'npc_add');
  assert.match(event.text, /Ambush/);

  let combat = { playerVitals: {}, ground: { npcs: [], order: [], round: 0, turn: 0 } };
  const r = applyGroundEvent(combat, event, { d10: () => 5 });
  assert.equal(r.unknown, false);
  const landed = r.patch.ground.npcs[0];
  for (const k of ['name', 'max', 'ws', 'bs', 'toughnessBonus', 'armour', 'weapon', 'agilityBonus']) {
    assert.deepEqual(landed[k], enc.hostiles[0][k], `npc_add lost ${k} on the way to the board`);
  }

  // No id is sent, so pushing the same encounter twice makes two groups
  // rather than one that overwrites itself.
  assert.equal(event.npcId, undefined);
  const a = applyGroundEvent(combat, event, {}).patch.ground.npcs[0];
  combat = { ...combat, ground: { ...combat.ground, npcs: [a] } };
  const b = applyGroundEvent(combat, event, {}).patch.ground.npcs[1];
  assert.notEqual(a.id, b.id, 'two pushes must not collide');

  // A hostile with nothing but a name still reaches the board.
  const bare = applyGroundEvent({ playerVitals: {}, ground: { npcs: [] } },
    toNpcAdd(readHostile({ name: 'Thing' })), {});
  assert.equal(bare.unknown, false);
  assert.equal(bare.patch.ground.npcs[0].name, 'Thing');
}

/* ---- drafts from a rolled system ---- */

{
  assert.deepEqual(draftsFromSystem(null), []);
  assert.deepEqual(draftsFromSystem({}), []);

  // A Pirate Den is a place something lives, so it is offered as a draft.
  const den = rollSystem(seeded(3), { features: [featureById('pirate_den')] });
  const denDrafts = draftsFromSystem(den);
  assert.ok(denDrafts.some((d) => d.source.feature === 'pirate_den'),
    'a Pirate Den should offer an encounter');

  // Across many systems the drafts are well formed and point at real tiers
  // and origins — a suggestion naming something that does not exist would
  // leave the builder with an unusable default.
  let sawElement = false;
  let sawInhabitants = false;
  for (let seed = 1; seed < 120; seed++) {
    const sys = rollSystem(seeded(seed));
    for (const dft of draftsFromSystem(sys)) {
      assert.ok(dft.id && dft.name && dft.note, 'a draft came back incomplete');
      assert.deepEqual(dft.hostiles, [], 'a draft is a place, not a stocked fight');
      assert.ok(tierById(dft.suggest.tierId), 'unknown tier ' + dft.suggest.tierId);
      assert.ok(dft.source && dft.source.kind, 'a draft must say where it came from');
      if (dft.source.kind === 'element') sawElement = true;
      if (dft.source.kind === 'inhabitants') sawInhabitants = true;
    }
  }
  assert.ok(sawElement, 'no derelict or graveyard turned up in 120 systems');
  assert.ok(sawInhabitants, 'no inhabited world turned up in 120 systems');

  // Stocking a draft turns a place into a usable fight.
  {
    const dft = denDrafts.find((d) => d.source.feature === 'pirate_den');
    assert.deepEqual(dft.hostiles, [], 'the draft itself stays a place');

    const stocked = stockDraft(dft, { rng: seeded(5) });
    assert.ok(stocked.hostiles.length >= 4, 'a den is 3-6 plus a leader');
    assert.ok(stocked.hostiles.length <= 7);
    assert.equal(stocked.id, dft.id, 'stocking keeps the draft it came from');
    assert.equal(stocked.name, dft.name);
    // The original is untouched — stocking twice gives two fights, not one
    // that grew.
    assert.deepEqual(dft.hostiles, []);

    // The leader is the toughest thing in it, which is the point of rolling
    // one: six identical Heavies is a wall, not an encounter.
    const weights = stocked.hostiles.map(hostileWeight);
    const leader = stocked.hostiles[stocked.hostiles.length - 1];
    assert.equal(Math.max(...weights), hostileWeight(leader),
      'the leader should outweigh the rank and file');
    assert.equal(leader.tier, 'elite');

    // Every stocked hostile is pushable, and the encounter weighs something.
    for (const h of stocked.hostiles) {
      assert.ok(h.name && h.max >= 1, 'a stocked hostile came back unusable');
      assert.equal(toNpcAdd(h).id, 'npc_add');
    }
    assert.ok(encounterWeight(stocked) > 0);
    assert.ok(difficulty(stocked, [{}, {}, {}, {}]).band, 'a stocked draft has a difficulty');
  }

  // A draft with no suggestion at all still stocks rather than throwing.
  {
    const bare = stockDraft({ id: 'x', name: 'Somewhere', hostiles: [] }, { rng: seeded(9) });
    assert.ok(bare.hostiles.length >= 1 && bare.hostiles.length <= 4);
  }
  assert.equal(stockDraft(null), null);

  // Every draft a system produces can be stocked, across many systems — a
  // suggestion naming an unrollable combination would throw here.
  for (let seed = 1; seed < 60; seed++) {
    for (const dft of draftsFromSystem(rollSystem(seeded(seed)))) {
      const stocked = stockDraft(dft, { rng: seeded(seed + 500) });
      assert.ok(stocked.hostiles.length > 0, dft.name + ' stocked empty');
      assert.ok(stocked.hostiles.length <= MAX_HOSTILES);
    }
  }

  // The dependency runs one way: stargen must not know about encounters.
  const stargenSource = await import('node:fs')
    .then((fs) => fs.readFileSync(new URL('./stargen.js', import.meta.url), 'utf8'));
  assert.equal(/encounters/i.test(stargenSource), false,
    'stargen.js must not depend on encounters.js');
}

/* ---- the line a list prints ---- */

{
  assert.equal(describeEncounter(null), 'empty');
  assert.equal(describeEncounter({ hostiles: [] }), 'empty');
  const mixed = { hostiles: [
    { name: 'a', tier: 'named' }, { name: 'b', tier: 'minor' }, { name: 'c', tier: 'minor' }
  ] };
  // Counted by tier, and listed weakest-first in the table's own order
  // rather than in whatever order they were added.
  assert.equal(describeEncounter(mixed), '2 Minor, 1 Named');
  assert.equal(describeEncounter({ hostiles: [{ name: 'x' }] }), '1 unranked');
}

console.log('encounters.js OK (%d bands, tier weights %s)',
  DIFFICULTY_BANDS.length, THREAT_TIERS.map((t) => `${t.name} ${tierWeight(t.id)}`).join(' / '));
