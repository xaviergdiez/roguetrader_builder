// Self-check for the session cookie flags — the security-relevant pure part of
// lib/auth.js. Run: node lib/auth.check.mjs
import assert from 'node:assert/strict';

// Redis.fromEnv() runs at module load and throws without these. No network call
// is made by constructing the client, so stub values are enough.
process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'stub';
delete process.env.VERCEL;

const { setCookie, clearCookie, randomToken, readSessionRecord, signInRecord, updateUser, CAS_SCRIPT, userKey, versionKey, AccountBusy } = await import('./auth.js');

/* ---- session records carry which door they came in through ---- */

assert.deepEqual(readSessionRecord({ uid: 'u1', gm: true }), { uid: 'u1', gm: true });
assert.deepEqual(readSessionRecord({ uid: 'u1' }), { uid: 'u1', gm: false });
// Sessions minted before the GM door existed stored a bare uid string. They
// read as player sessions rather than crashing or logging everyone out.
assert.deepEqual(readSessionRecord('u-legacy'), { uid: 'u-legacy', gm: false });
assert.equal(readSessionRecord(null), null);
assert.equal(readSessionRecord(undefined), null);
// anything truthy but odd still cannot claim GM
assert.deepEqual(readSessionRecord({ uid: 'u1', gm: 'yes' }), { uid: 'u1', gm: true });
assert.deepEqual(readSessionRecord({ uid: 'u1', gm: 0 }), { uid: 'u1', gm: false });

// minimal stand-in for the Vercel response object
const fakeRes = () => {
  const headers = {};
  return {
    headers,
    getHeader: (k) => headers[k],
    setHeader: (k, v) => { headers[k] = v; }
  };
};

// a session cookie must not be readable by script, must be path-wide, and must
// survive the cross-site redirect back from Google (Lax, not Strict)
let res = fakeRes();
setCookie(res, 'sid', 'abc', 100);
const cookie = res.getHeader('Set-Cookie');
assert.ok(cookie.includes('sid=abc'));
assert.ok(cookie.includes('HttpOnly'), 'session cookie must be HttpOnly');
assert.ok(cookie.includes('Path=/'));
assert.ok(cookie.includes('SameSite=Lax'), 'Strict would break the OAuth return');
assert.ok(cookie.includes('Max-Age=100'));

// off Vercel (`vercel dev` serves plain http) Secure would drop the cookie
assert.ok(!cookie.includes('Secure'), 'no Secure off-platform');

// on Vercel it must be there
process.env.VERCEL = '1';
res = fakeRes();
setCookie(res, 'sid', 'abc', 100);
assert.ok(res.getHeader('Set-Cookie').includes('Secure'), 'Secure required on Vercel');
delete process.env.VERCEL;

// two cookies in one response accumulate instead of overwriting — the callback
// clears gstate and sets sid in the same response
res = fakeRes();
setCookie(res, 'gstate', '', 0);
setCookie(res, 'sid', 'xyz', 100);
const both = res.getHeader('Set-Cookie');
assert.ok(Array.isArray(both) && both.length === 2, 'both cookies must survive');
assert.ok(both.some((c) => c.startsWith('gstate=')));
assert.ok(both.some((c) => c.startsWith('sid=xyz')));

// clearing expires immediately
res = fakeRes();
clearCookie(res, 'sid');
assert.ok(res.getHeader('Set-Cookie').includes('Max-Age=0'));

// session tokens are 32 bytes of hex and not repeated
assert.match(randomToken(), /^[0-9a-f]{64}$/);
assert.notEqual(randomToken(), randomToken());

/* ---- signing in must not erase what the account already holds ----
   The callback used to write { email, name, chars } as the whole record, so a
   sign-in on a second device dropped the deck and ground indexes, the homebrew
   library and the tables, and the first device's maps were gone. */
{
  const account = {
    email: 'old@example.com', name: 'Old Name',
    chars: [{ id: 'c1', name: 'Zed' }],
    decks: [{ id: 'd1', name: 'Hulk deck', cols: 40, rows: 30 }],
    grounds: [{ id: 'g1', name: 'Rust floor' }],
    homebrew: { hulls: [{ id: 'h1' }], encounters: [{ id: 'e1' }], voidcharts: [{ id: 'v1' }] },
    dynasties: ['ABCD12', 'WXYZ34']
  };
  const after = signInRecord(account, { email: 'new@example.com', name: 'New Name' });
  assert.equal(after.email, 'new@example.com', 'identity is refreshed');
  assert.equal(after.name, 'New Name');
  assert.deepEqual(after.chars, account.chars);
  assert.deepEqual(after.decks, account.decks, 'the deck index survives a sign-in');
  assert.deepEqual(after.grounds, account.grounds, 'and the ground index');
  assert.deepEqual(after.homebrew, account.homebrew, 'and the homebrew library');
  assert.deepEqual(after.dynasties, account.dynasties, 'and the tables it belongs to');
  assert.deepEqual(account.email, 'old@example.com', 'the stored record is not mutated');
  // a field this code has never heard of is kept too
  assert.equal(signInRecord({ chars: [], futureThing: { a: 1 } }, { email: 'e', name: 'n' }).futureThing.a, 1);
  // a first sign-in, and a damaged record, still give a usable one
  assert.deepEqual(signInRecord(null, { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord(undefined, { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord('junk', { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord([1, 2], { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord({ chars: 'broken' }, { email: 'e', name: 'n' }).chars, [], 'a non-list chars becomes one');
}

/* ---- changing the record without losing a concurrent change ----
   A stand-in for Upstash that behaves like it where it matters here: every
   call takes a turn of the event loop (so requests interleave as they do over
   the network), MGET reads both keys at one instant, and the compare-and-set
   script is atomic. The record comes back parsed and the version as a number,
   as the SDK returns them. */
{
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  const makeFake = (seed = {}) => {
    const kv = new Map(Object.entries(seed));
    let writes = 0;
    return {
      kv, get writes() { return writes; },
      async mget(...keys) { await tick(); return keys.map((k) => { const v = kv.get(k); if (v === undefined) return null; try { return JSON.parse(v); } catch { return v; } }); },
      async eval(script, keys, args) {
        await tick();
        assert.equal(script, CAS_SCRIPT, 'only the compare-and-set script is sent');
        const cur = kv.has(keys[1]) ? kv.get(keys[1]) : false;
        if ((cur === false && args[0] === '') || cur === args[0]) {
          kv.set(keys[0], args[1]); kv.set(keys[1], args[2]); writes++;
          return 1;
        }
        return 0;
      }
    };
  };
  const noWait = async () => {};
  const read = (c, uid = 'u1') => JSON.parse(c.kv.get(userKey(uid)));

  // a first write on a record that does not exist yet, and the version it starts
  let c = makeFake();
  let r = await updateUser('u1', (u) => { u.chars = [{ id: 'a' }]; }, { client: c, wait: noWait });
  assert.equal(r.written, true);
  assert.deepEqual(read(c), { chars: [{ id: 'a' }] });
  assert.equal(c.kv.get(versionKey('u1')), '1');

  // a record written before there was a version (no version key) is read and kept whole
  c = makeFake({ [userKey('u1')]: JSON.stringify({ email: 'e', chars: [{ id: 'old' }], homebrew: { hulls: [{ id: 'h' }] } }) });
  await updateUser('u1', (u) => { u.decks = [{ id: 'd' }]; }, { client: c, wait: noWait });
  assert.deepEqual(read(c), { email: 'e', chars: [{ id: 'old' }], homebrew: { hulls: [{ id: 'h' }] }, decks: [{ id: 'd' }] }, 'the rest of the record is untouched');
  assert.equal(c.kv.get(versionKey('u1')), '1');
  await updateUser('u1', (u) => { u.decks.push({ id: 'd2' }); }, { client: c, wait: noWait });
  assert.equal(c.kv.get(versionKey('u1')), '2', 'the version moves on each write');

  // returning false writes nothing and does not move the version
  const before = c.kv.get(userKey('u1'));
  r = await updateUser('u1', (u) => { u.decks = []; return false; }, { client: c, wait: noWait });
  assert.equal(r.written, false);
  assert.equal(c.kv.get(userKey('u1')), before);
  assert.equal(c.kv.get(versionKey('u1')), '2');

  // what mutate returns comes back, and the copy handed to it is not the stored object
  r = await updateUser('u1', (u) => u.decks.length, { client: c, wait: noWait });
  assert.equal(r.value, 2);
  assert.equal(r.user.decks.length, 2);

  // a damaged record (not an object) is replaced by an empty one rather than crashing
  c = makeFake({ [userKey('u1')]: JSON.stringify([1, 2, 3]) });
  await updateUser('u1', (u) => { u.chars = []; }, { client: c, wait: noWait });
  assert.deepEqual(read(c), { chars: [] });

  // THE POINT: several saves at once, each adding its own entry to the same field
  // and to its own field. Nobody's entry is lost.
  c = makeFake({ [userKey('u1')]: JSON.stringify({ email: 'e', chars: [] }) });
  let runs = 0;
  const adds = Array.from({ length: 6 }, (_, i) => updateUser('u1', (u) => {
    runs++;
    u.decks = [...(u.decks || []), { id: 'd' + i }];
    u['field' + i] = i;
  }, { client: c, wait: async () => new Promise((res) => setTimeout(res, Math.random() * 4)) }));
  await Promise.all(adds);
  const fin = read(c);
  assert.deepEqual((fin.decks || []).map((d) => d.id).sort(), ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'], 'all six decks are listed');
  for (let i = 0; i < 6; i++) assert.equal(fin['field' + i], i, 'and all six fields');
  assert.equal(fin.email, 'e');
  assert.ok(runs > 6, `colliding saves re-ran their change on the newer record: ${runs} runs for 6 saves`);
  assert.equal(c.kv.get(versionKey('u1')), '6', 'six writes, six versions');

  // a database that will not run the script must not stop saving: it falls back to a plain write
  {
    const kv = new Map();
    const noScripts = {
      async mget(...keys) { return keys.map((k) => (kv.has(k) ? kv.get(k) : null)); },
      async eval() { throw new Error('ERR unknown command eval'); },
      async set(k, v) { kv.set(k, v); }
    };
    const origError = console.error; const logged = [];
    console.error = (...a) => logged.push(a.join(' '));
    const out = await updateUser('u9', (u) => { u.chars = [{ id: 'z' }]; }, { client: noScripts, wait: noWait });
    console.error = origError;
    assert.equal(out.written, true);
    assert.deepEqual(kv.get(userKey('u9')), { chars: [{ id: 'z' }] });
    assert.ok(logged.some((l) => /compare-and-set unavailable/.test(l)), 'and says so in the log');
  }

  // when the account is too contended it says so, and never loses a change silently:
  // each save either finished (and is in the record) or threw AccountBusy
  c = makeFake({ [userKey('u1')]: JSON.stringify({ items: [] }) });
  const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) =>
    updateUser('u1', (u) => { u.items.push(i); }, { client: c, tries: 2, wait: noWait })));
  const done = outcomes.filter((o) => o.status === 'fulfilled').length;
  const busy = outcomes.filter((o) => o.status === 'rejected');
  assert.ok(busy.length > 0, 'with two tries and twelve savers some give up');
  assert.ok(busy.every((o) => o.reason instanceof AccountBusy && o.reason.code === 'account_busy'));
  assert.equal(read(c).items.length, done, 'exactly the saves that finished are in the record');
  assert.equal(new Set(read(c).items).size, done, 'none twice');
}

console.log('auth: all checks passed');
