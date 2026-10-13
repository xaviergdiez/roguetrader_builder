// Self-check for the named Elite Advances. Run: node src/elite.check.mjs
import assert from 'node:assert/strict';
import { ELITE_ADVANCES, eliteById, meetsRequirement, elitePresets } from './elite.js';
import { CAREERS_WITH_TABLES } from './advances.js';

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

// Dark Heresy models the Inquisition as an Alternate Career Rank — a detour
// taken mid-career, not a career you start in — which is why it is here at
// all. The three rungs must gate on each other, or "become an Interrogator"
// is three unrelated purchases rather than a path.
{
  const seneschal = (rank, owned = []) => ({ careerName: 'Seneschal', rank, owned });
  const legate = eliteById('legate-investigator');
  const interrogator = eliteById('interrogator');
  const rosette = eliteById('inquisitorial-rosette');

  assert.equal(legate.minRank, 4, "the Handbook's own Rank 4+");
  assert.equal(meetsRequirement(legate, seneschal(3)), false);
  assert.equal(meetsRequirement(legate, seneschal(4)), true);

  // The Tech-Priest is the one career the book bars from this path.
  assert.equal(legate.careers.includes('Explorator'), false,
    'the Explorator has the Magos road instead');

  // Rank alone is not enough: each rung needs the one below it.
  assert.equal(meetsRequirement(interrogator, seneschal(8)), false, 'no Legature yet');
  assert.equal(meetsRequirement(interrogator, seneschal(8, ['Legate Investigator'])), true);
  assert.equal(meetsRequirement(interrogator, seneschal(5, ['Legate Investigator'])), false,
    'and the rank still applies');

  assert.equal(meetsRequirement(rosette, seneschal(8, ['Legate Investigator'])), false);
  assert.equal(meetsRequirement(rosette, seneschal(8, ['Legate Investigator', 'Interrogator'])), true);

  // The names a rung stands on must be names that actually exist, or the
  // ladder has a missing step nobody can ever climb.
  for (const e of ELITE_ADVANCES) {
    if (!e.prereqElite) continue;
    assert.ok(ELITE_ADVANCES.some((x) => x.name === e.prereqElite),
      e.id + ': stands on "' + e.prereqElite + '", which is not in the catalogue');
    assert.match(e.requires, /before it/, e.id + ': the ladder step must be readable');
  }

  // The rosette is granted for what a character did, not where they began.
  assert.deepEqual(rosette.careers, []);
  assert.equal(meetsRequirement(rosette,
    { careerName: 'Void-Master', rank: 8, owned: ['Legate Investigator', 'Interrogator'] }), true);
}

// An entry with no ladder step is unaffected by what is already owned.
assert.equal(meetsRequirement(eliteById('executioner'),
  { careerName: 'Bladedancer', rank: 4, owned: [] }), true);

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
