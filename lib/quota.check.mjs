// Self-check for the daily allowance on image generation. Run: node lib/quota.check.mjs
import assert from 'node:assert/strict';
import { takeAllowance, giveBack, dailyLimit, dayStamp, limitMessage, secondsToReset, DEFAULT_DAILY_IMAGES } from './quota.js';

const fake = () => {
  const kv = new Map(); const ttl = new Map();
  return {
    kv, ttl,
    async incr(k) { kv.set(k, (kv.get(k) || 0) + 1); return kv.get(k); },
    async decr(k) { kv.set(k, (kv.get(k) || 0) - 1); return kv.get(k); },
    async expire(k, s) { ttl.set(k, s); return 1; }
  };
};
const DAY1 = Date.UTC(2026, 10, 3, 9, 0, 0), DAY2 = Date.UTC(2026, 10, 4, 0, 0, 1);

// the limit from the environment: a whole number of 1 or more, else the default
assert.equal(dailyLimit({}), DEFAULT_DAILY_IMAGES);
assert.equal(dailyLimit({ IMAGE_DAILY_LIMIT: '12' }), 12);
assert.equal(dailyLimit({ IMAGE_DAILY_LIMIT: ' 5 ' }), 5);
for (const bad of ['', '0', '-3', '2.5', 'many', 'NaN']) assert.equal(dailyLimit({ IMAGE_DAILY_LIMIT: bad }), DEFAULT_DAILY_IMAGES, JSON.stringify(bad));

// counting: allowed up to the limit, refused after, per account and per day
const r = fake();
const take = (uid, limit = 3, now = DAY1) => takeAllowance(r, { uid, limit, now });
assert.deepEqual((await take('u1')).ok, true);
assert.equal((await take('u1')).used, 2);
assert.equal((await take('u1')).ok, true, 'the third is the last allowed');
const over = await take('u1');
assert.equal(over.ok, false, 'the fourth is refused');
assert.equal(over.used, 3, 'a refusal is not counted as a generation'); assert.equal(over.limit, 3);
assert.equal((await take('u1')).ok, false, 'asking again is refused again');
assert.equal(r.kv.get(over.key), 3, 'and the counter still reads three');
assert.equal((await take('u2')).ok, true, 'another account has its own');
assert.equal((await take('u1', 3, DAY2)).ok, true, 'and a new UTC day starts again');
assert.equal(dayStamp(DAY1), '2026-11-03');
assert.match(over.key, /^rt:quota:images:u1:2026-11-03$/);

// the key outlives its day, so nothing needs clearing; set once, when first made
assert.equal(r.ttl.get(over.key), 172800);
let sets = 0; const watch = { ...r, async expire(k, s) { sets++; return r.expire(k, s); } };
await takeAllowance(watch, { uid: 'u3', now: DAY1 }); await takeAllowance(watch, { uid: 'u3', now: DAY1 });
assert.equal(sets, 1, 'the expiry is set when the counter is created, not on every call');

// a call that failed on Google's side is handed back
const a = await takeAllowance(r, { uid: 'u4', limit: 1, now: DAY1 });
assert.equal(a.ok, true);
await giveBack(r, a.key);
assert.equal((await takeAllowance(r, { uid: 'u4', limit: 1, now: DAY1 })).ok, true, 'so it can be spent again');
await giveBack({ decr: async () => { throw new Error('down'); } }, 'k');   // never throws

assert.match(limitMessage(40), /40 generated images/);
assert.equal(secondsToReset(Date.UTC(2026, 10, 3, 23, 59, 0)), 60);
assert.ok(secondsToReset(Date.UTC(2026, 10, 3, 0, 0, 0)) === 86400);
console.log('quota: all checks passed');
