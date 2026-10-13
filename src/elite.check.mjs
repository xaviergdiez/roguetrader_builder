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

console.log('elite.js OK (%d named advances)', ELITE_ADVANCES.length);
