// Self-check for the Throne Gelt purse. Run: node src/purse.check.mjs
import assert from 'node:assert/strict';
import { EMPTY, read, spent, balance, canAfford, grant, spend, refund, fmt } from './purse.js';

/* ---- the empty purse, and older sheets that predate it ---- */

assert.deepEqual(EMPTY, { thrones: 0, spends: [] });
assert.deepEqual(read(undefined), EMPTY, 'a sheet saved before the purse existed still loads');
assert.deepEqual(read(null), EMPTY);
assert.deepEqual(read({}), EMPTY);
assert.equal(balance(undefined), 0);
assert.equal(spent(null), 0);

// Junk in the stored shape does not become NaN on screen.
assert.equal(read({ thrones: 'lots' }).thrones, 0);
assert.equal(read({ thrones: '12000' }).thrones, 12000);
assert.equal(read({ thrones: 1500.9 }).thrones, 1500);
assert.deepEqual(read({ spends: 'no' }).spends, []);
assert.deepEqual(read({ spends: [{ cost: 5 }] }).spends, [], 'a line with no label is not a purchase');
assert.equal(read({ spends: [{ label: 'x', cost: 'free' }] }).spends[0].cost, 0);

/* ---- granting replaces, it does not accumulate ---- */

{
  let p = grant(EMPTY, 12000);
  assert.equal(balance(p), 12000);
  p = grant(p, 500);
  assert.equal(balance(p), 500, 'the field is the grant, not a deposit');
  assert.equal(grant(p, '').thrones, 0);
}

/* ---- spending is a line, and the balance is derived from it ---- */

{
  let p = grant(EMPTY, 12000);
  p = spend(p, { id: 'arm', label: 'Good Bionic Arm', cost: 1500 });
  assert.equal(spent(p), 1500);
  assert.equal(balance(p), 10500);
  assert.deepEqual(p.spends[0], { id: 'arm', label: 'Good Bionic Arm', cost: 1500 });

  p = spend(p, { id: 'suit', label: 'Light Power Armour', cost: 10000 });
  assert.equal(balance(p), 500);
  assert.equal(p.spends.length, 2, 'the ledger shows where it went');

  // A double-click is one purchase.
  p = spend(p, { id: 'suit', label: 'Light Power Armour', cost: 10000 });
  assert.equal(p.spends.length, 2);
  assert.equal(balance(p), 500);

  // Refunding a line gives the money back and leaves the rest alone.
  p = refund(p, 'suit');
  assert.equal(balance(p), 10500);
  assert.equal(p.spends.length, 1);
  assert.deepEqual(refund(p, 'nothing-by-that-name').spends, p.spends);

  // A line with no label buys nothing.
  assert.deepEqual(spend(p, { cost: 99 }).spends, p.spends);
}

/* ---- affordability, including the exact-change case ---- */

{
  const p = spend(grant(EMPTY, 1500), { label: 'x', cost: 500 });
  assert.equal(balance(p), 1000);
  assert.equal(canAfford(p, 1000), true, 'exactly enough is enough');
  assert.equal(canAfford(p, 1001), false);
  assert.equal(canAfford(p, 0), true);
  assert.equal(canAfford(EMPTY, 1), false, 'an empty purse buys nothing');
}

// Overspending is recorded rather than refused — the GM may allow debt, and a
// negative balance on screen is more honest than a silently dropped purchase.
{
  const p = spend(grant(EMPTY, 1000), { label: 'Ignatus Power Armour', cost: 20000 });
  assert.equal(balance(p), -19000);
}

assert.equal(fmt(20000), '20,000');
assert.equal(fmt(undefined), '0');

console.log('purse.js OK');
