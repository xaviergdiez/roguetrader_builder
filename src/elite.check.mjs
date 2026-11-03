// Self-check for the named Elite Advances. Run: node src/elite.check.mjs
import assert from 'node:assert/strict';
import { ELITE_ADVANCES, eliteById, meetsRequirement, elitePresets, heldNames, INQUISITION_KINDS } from './elite.js';
import { CAREERS_WITH_TABLES, ALTERNATE_RANKS, alternateRankByName } from './advances.js';

/* ---- the catalogue is well formed ---- */

const TYPES = ['Skill', 'Talent', 'Trait'];
for (const e of ELITE_ADVANCES) {
  assert.ok(e.id && e.name && e.effect, e.id + ' is incomplete');
  assert.ok(TYPES.includes(e.type), e.id + ': the dialog only offers ' + TYPES.join('/'));
  assert.ok(Number.isInteger(e.cost) && e.cost > 0, e.id + ': needs an XP cost');
  // A requirement nobody can read is worse than none.
  if (e.careers || e.minRank) assert.ok(e.requires, e.id + ': gated but says nothing');
  // Gating on a career this app does not have would be unmeetable forever.
  for (const c of e.careers || []) {
    assert.ok(CAREERS_WITH_TABLES.includes(c), e.id + ': unknown career ' + c);
  }
}

assert.equal(eliteById('executioner').name, 'Executioner');
assert.equal(eliteById('nonsense'), null);

// Ids are what the dialog keys on, so a duplicate would drop a row silently.
{
  const ids = ELITE_ADVANCES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id in the catalogue');
}

// The two careers the supplied list named that this app does not have: a
// gate on either could never be met, so the entry would sit permanently out
// of reach while looking like a live option.
for (const e of ELITE_ADVANCES) {
  for (const c of e.careers || []) {
    assert.notEqual(c, 'Sanctioned Psyker', e.id + ': use Astropath Transcendent');
    assert.notEqual(c, 'Ork Weirdboy', e.id + ': use Ork Freebooter');
  }
}
assert.ok(eliteById('operative-exploit-analysis').careers.includes('Astropath Transcendent'),
  'the Operative entry keeps its psyker route');

// "Any Career" is an empty list rather than an enumeration, or it goes stale
// the next time a career is added — as it already had, missing five.
{
  const exemplar = eliteById('exemplar-apex-resolve');
  assert.deepEqual(exemplar.careers, []);
  assert.match(exemplar.requires, /Any Career/);
  for (const career of CAREERS_WITH_TABLES) {
    assert.equal(meetsRequirement(exemplar, { careerName: career, rank: 5 }), true, career);
  }
  assert.equal(meetsRequirement(exemplar, { careerName: 'Bladedancer', rank: 4 }), false,
    'but Rank V still means Rank V');
}

/* ---- requirements report, and report accurately ---- */

const exe = eliteById('executioner');
assert.equal(meetsRequirement(exe, { careerName: 'Bladedancer', rank: 4 }), true);
assert.equal(meetsRequirement(exe, { careerName: 'Arch-Militant', rank: 8 }), true,
  'the Warrior line maps to the Arch-Militant here');
assert.equal(meetsRequirement(exe, { careerName: 'Bladedancer', rank: 3 }), false, 'too junior');
assert.equal(meetsRequirement(exe, { careerName: 'Seneschal', rank: 8 }), false, 'wrong career');
assert.equal(meetsRequirement(exe, {}), false);
assert.equal(meetsRequirement(null, { careerName: 'Bladedancer', rank: 8 }), false);

// An entry with no gate at all is open to everyone.
assert.equal(meetsRequirement({ name: 'Open' }, { careerName: 'Seneschal' }), true);
assert.equal(meetsRequirement({ name: 'Open', careers: [] }, { careerName: 'Seneschal' }), true);

/* ---- the catalogue is never filtered, only marked ---- */

// A GM looking for something to grant sees everything: Elite Advances are
// the one place the rank ladder deliberately does not apply, so a printed
// requirement must not quietly remove the option.
{
  const forNobody = elitePresets({ careerName: 'Seneschal', rank: 1 });
  assert.equal(forNobody.length, ELITE_ADVANCES.length, 'nothing is hidden');
  assert.equal(forNobody.find((e) => e.id === 'executioner').met, false);

  const forBlade = elitePresets({ careerName: 'Bladedancer', rank: 5 });
  assert.equal(forBlade.find((e) => e.id === 'executioner').met, true);
  assert.equal(forBlade.length, forNobody.length);
}

/* ---- the ones that fit come first, and catalogue order survives ---- */

// Sorting is what keeps "never filtered" usable as the catalogue grows.
{
  const list = elitePresets({ careerName: 'Arch-Militant', rank: 5 });
  const firstUnmet = list.findIndex((e) => !e.met);
  assert.ok(firstUnmet > 0, 'an Arch-Militant matches something');
  assert.ok(list.slice(0, firstUnmet).every((e) => e.met), 'met entries lead');
  assert.ok(list.slice(firstUnmet).every((e) => !e.met), 'and unmet entries follow');

  // Within each half, the catalogue's own order is kept — a stable sort, so
  // the list does not reshuffle itself between two equally-matching entries.
  const order = (ids) => ids.map((id) => ELITE_ADVANCES.findIndex((e) => e.id === id));
  const metOrder = order(list.filter((e) => e.met).map((e) => e.id));
  assert.deepEqual(metOrder.slice().sort((a, b) => a - b), metOrder, 'met half is stable');

  // Nobody matching anything still gets the catalogue in its own order.
  const none = elitePresets({ careerName: 'Navigator', rank: 1 });
  assert.deepEqual(none.map((e) => e.id), ELITE_ADVANCES.map((e) => e.id));
}

/* ---- the catalogue covers the careers it claims to ---- */

// Every career should have something it can be offered, or the dialog is
// empty-handed for whoever plays it.
for (const career of CAREERS_WITH_TABLES) {
  const any = elitePresets({ careerName: career, rank: 8 }).some((e) => e.met);
  assert.ok(any, career + ': nothing in the catalogue is ever available to it');
}

/* ---- the Inquisition ladder stands on itself ---- */

// Dark Heresy models the Inquisition as an Alternate Career Rank, a detour
// taken mid-career, and the Legate Investigator is now exactly that, in
// advances.js. The rungs above stand on it and on each other, or "become an
// Interrogator" is three unrelated purchases rather than a path.
{
  const seneschal = (rank, owned = []) => ({ careerName: 'Seneschal', rank, owned });
  const interrogator = eliteById('interrogator');
  const rosette = eliteById('inquisitorial-rosette');

  // The Legature left the catalogue for the alternate ranks, taking its own
  // table's advances with it: no duplicate to buy twice at two prices.
  for (const gone of ['legate-investigator', 'ciphers-of-the-ordos', 'talented-interrogation']) {
    assert.equal(eliteById(gone), null, gone + ' is on the Legate Investigator table now');
  }
  const legate = alternateRankByName('Legate Investigator');
  assert.ok(legate, 'the Legature is an alternate rank');
  assert.equal(legate.minRank, 4, "the Handbook's own Rank 4+");
  // The Tech-Priest is the one career the book bars from this path.
  assert.equal(legate.careers.includes('Explorator'), false, 'the Explorator has the Magos road instead');

  // Rank alone is not enough: each rung needs the one below it, and the
  // Legature counts whether it is held as the alternate rank or (on an older
  // sheet) as the Elite Advance it used to be.
  assert.equal(meetsRequirement(interrogator, seneschal(8)), false, 'no Legature yet');
  assert.equal(meetsRequirement(interrogator, seneschal(8, ['Legate Investigator'])), true);
  assert.equal(meetsRequirement(interrogator, seneschal(8, heldNames({ altRank: 'Legate Investigator' }))), true,
    'the alternate rank is the Legature');
  assert.equal(meetsRequirement(interrogator, seneschal(8, heldNames({ eliteAdvances: [{ name: 'Legate Investigator' }] }))), true,
    'and so is an older sheet that bought it as an Elite Advance');
  assert.equal(meetsRequirement(interrogator, seneschal(5, ['Legate Investigator'])), false,
    'and the rank still applies');

  assert.equal(meetsRequirement(rosette, seneschal(8, ['Legate Investigator'])), false);
  assert.equal(meetsRequirement(rosette, seneschal(8, ['Legate Investigator', 'Interrogator'])), true);

  // The names a rung stands on must be names that exist, in the catalogue,
  // among the alternate ranks or on one of their tables, or the ladder has a
  // step nobody can ever climb.
  const known = new Set([
    ...ELITE_ADVANCES.map((x) => x.name),
    ...ALTERNATE_RANKS.map((r) => r.name),
    ...ALTERNATE_RANKS.flatMap((r) => r.advances.map((a) => a.name))
  ]);
  for (const e of ELITE_ADVANCES) {
    if (!e.prereqElite) continue;
    assert.ok(known.has(e.prereqElite), e.id + ': stands on "' + e.prereqElite + '", which nobody can hold');
    assert.match(e.requires, /before it/, e.id + ': the ladder step must be readable');
  }

  // The rosette is granted for what a character did, not where they began.
  assert.deepEqual(rosette.careers, []);
  assert.equal(meetsRequirement(rosette,
    { careerName: 'Void-Master', rank: 8, owned: ['Legate Investigator', 'Interrogator'] }), true);

  // Every Inquisition entry says which part of the ladder it is, so the
  // dialog can show the ladder as one.
  const kinds = INQUISITION_KINDS.map((k) => k.id);
  const inq = ELITE_ADVANCES.filter((e) => e.inquisition);
  for (const e of inq) assert.ok(kinds.includes(e.inquisition), e.id + ': unknown part ' + e.inquisition);
  for (const k of kinds) assert.ok(inq.some((e) => e.inquisition === k), 'nothing in ' + k);
  assert.equal(eliteById('interrogator').inquisition, 'rank');
  assert.equal(eliteById('forbidden-knowledge').inquisition, 'radical');
}

/* ---- heldNames: everything a rung may stand on ---- */
assert.deepEqual(heldNames({}), []);
assert.deepEqual(heldNames({
  eliteAdvances: [{ name: 'Interrogator' }], advances: [{ name: 'Talented (Interrogation)' }], altRank: 'Legate Investigator'
}), ['Interrogator', 'Talented (Interrogation)', 'Legate Investigator']);
// The Long Question stands on an advance from the Legate's own table.
assert.equal(meetsRequirement(eliteById('the-long-question'),
  { careerName: 'Missionary', rank: 4, owned: heldNames({ advances: [{ name: 'Talented (Interrogation)' }] }) }), true);

/* ---- the Radical's rung is the GM's to grant, to anyone ---- */
{
  const fk = eliteById('forbidden-knowledge');
  assert.deepEqual(fk.careers, [], 'the book\u2019s examples are Acolytes, not titled Inquisitors');
  assert.match(fk.requires, /GM/);
  assert.match(fk.effect, /Corruption/);
  assert.match(fk.effect, /Willpower/);
}

// An entry with no ladder step is unaffected by what is already owned.
assert.equal(meetsRequirement(eliteById('executioner'),
  { careerName: 'Bladedancer', rank: 4, owned: [] }), true);

/* ---- the investigator's craft sits below the titles, not above ---- */

// The ladder is rank: who you are allowed to be. The craft is what a cult
// breaker actually does. A toolkit priced above the title it serves would
// never be bought, so each craft entry must cost less than the Interrogator
// rung it works beneath.
{
  const CRAFT = ['read-the-room', 'canvass-the-locale', 'scene-of-the-deed',
    'the-long-question', 'cult-signifiers', 'cell-handler'];
  const interrogator = eliteById('interrogator');

  for (const id of CRAFT) {
    const e = eliteById(id);
    assert.ok(e, id + ' is missing');
    assert.ok(e.cost < interrogator.cost,
      id + ' costs more than the Interrogator rung it works beneath');
    // Every one names a test a GM can actually call for off the sheet.
    assert.match(e.effect,
      /Scrutiny|Inquiry|Interrogation|Logic|Search|Willpower|Fellowship|Degree/,
      id + ': an advance has to say what is rolled');
  }

  // The two that stand on a rung say so, and the rung exists.
  const long = eliteById('the-long-question');
  assert.equal(long.prereqElite, 'Talented (Interrogation)');
  const handler = eliteById('cell-handler');
  assert.equal(handler.prereqElite, 'Legate Investigator');

  // A Seneschal with the Legature can take the handler; one without cannot,
  // however senior. That is the whole point of keying the craft to the rung.
  const sen = (rank, owned = []) => ({ careerName: 'Seneschal', rank, owned });
  assert.equal(meetsRequirement(handler, sen(8)), false);
  assert.equal(meetsRequirement(handler, sen(8, ['Legate Investigator'])), true);
  assert.equal(meetsRequirement(handler, sen(4, ['Legate Investigator'])), false,
    'the rank still applies');

  // The craft is reachable before the rosette, so an investigator can be
  // equipped to investigate long before anyone hands them one.
  assert.ok(eliteById('read-the-room').minRank < alternateRankByName('Legate Investigator').minRank,
    'the first tool should come before the warrant');
}

/* ---- distance is measured in metres, never in tiles ---- */

// Rogue Trader measures range in metres throughout, and movement.js already
// turns an Agility Bonus of 3 into a 3-metre Half Move. An entry quoting
// tiles would be the only thing on the sheet on a different scale, and the
// reader would have no conversion to apply.
for (const e of ELITE_ADVANCES) {
  const text = [e.name, e.requires, e.effect, e.note].filter(Boolean).join(' ');
  assert.equal(/\btiles?\b/i.test(text), false, e.id + ' still measures in tiles');
}

// The eight that carry a distance say so in metres.
{
  const withDistance = ELITE_ADVANCES.filter((e) => /\bmetres?\b/i.test(e.effect));
  assert.ok(withDistance.length >= 8, 'the converted entries kept their distances');
  assert.match(eliteById('officer-bring-it-down').effect, /within 6 metres/);
  assert.match(eliteById('vanguard-unyielding-beacon').effect, /radius of 3 metres/);
  assert.match(eliteById('soldier-run-and-gun').effect, /\+3 metres of tactical movement/);
}

/* ---- nothing here belongs to one character ---- */

// These are offered to whoever takes the career, so a talent naming a
// specific person, ship or officer would read as somebody else's sheet. The
// names the entries arrived with are listed so the guard is obvious.
{
  const NAMES = ['Sarge', 'Haddon', 'Mara', 'Thorne', 'Linus', 'Theta',
    'Callian', 'Ardarius', 'Sevarus', 'Apex Predator', 'Araessa', 'Belara',
    'Laeth', 'Red\u2019s'];
  for (const e of ELITE_ADVANCES) {
    const text = [e.name, e.requires, e.effect, e.note].filter(Boolean).join(' ');
    for (const n of NAMES) {
      assert.equal(text.includes(n), false, e.id + ' still names ' + n);
    }
  }
}

console.log('elite.js OK (%d named advances)', ELITE_ADVANCES.length);
