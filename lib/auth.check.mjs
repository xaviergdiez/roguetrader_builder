// Self-check for the session cookie flags — the security-relevant pure part of
// lib/auth.js. Run: node lib/auth.check.mjs
import assert from 'node:assert/strict';

// Redis.fromEnv() runs at module load and throws without these. No network call
// is made by constructing the client, so stub values are enough.
process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'stub';
delete process.env.VERCEL;

const { setCookie, clearCookie, randomToken } = await import('./auth.js');

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

console.log('auth: all checks passed');
