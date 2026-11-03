// The REAL api handlers, run against a fake Upstash, for tests that need two devices (or two
// requests at once) on one account. Not a mock of the handlers: they run as deployed, and only
// the database behind them is a stand-in that speaks the handful of commands they use.
//
//   node tests/sim-api.mjs     api on :5290, fake Upstash on :5291, a peek into it on :5292
//   (a cookie  sid=SIM1  is a signed-in GM session for account u1; sid=SIM2 a player, account u2)
//
// The peek: ?k=<key> reads one, ? lists keys, ?wipe=1 does what the old sign-in did to the
// record, ?gemini=fail (or empty) makes the image service fail, ?set=<key>&v=<raw> seeds a key, ?fail=<endpoint> makes its GET fail, ?log=1 (or =clear) the requests seen.
import http from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const store = new Map();
const log = [];
let failing = '';

// ---- a fake Upstash REST endpoint (the commands the handlers use)
const up = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const b64 = String(req.headers['upstash-encoding'] || '') === 'base64';
    const enc = (v) => (typeof v === 'string' ? (v === 'OK' ? v : Buffer.from(v, 'utf8').toString('base64')) : Array.isArray(v) ? v.map(enc) : v);
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
    const one = (cmd) => {
      const [op, key, val] = cmd; const o = String(op).toUpperCase();
      if (o === 'GET') return store.has(key) ? store.get(key) : null;
      if (o === 'SET') { store.set(key, val); return 'OK'; }
      if (o === 'DEL') { let n = 0; for (const k of cmd.slice(1)) if (store.delete(k)) n++; return n; }
      if (o === 'EXPIRE') return 1;
      if (o === 'INCR') { const n = (Number(store.get(key)) || 0) + 1; store.set(key, String(n)); return n; }
      if (o === 'DECR') { const n = (Number(store.get(key)) || 0) - 1; store.set(key, String(n)); return n; }
      if (o === 'MGET') return cmd.slice(1).map((k) => (store.has(k) ? store.get(k) : null));
      if (o === 'EVAL') {                       // only the account record's compare-and-set
        const [, script, nKeys, ...rest] = cmd;
        const n = Number(nKeys);
        const [k1, k2] = rest.slice(0, n), [a1, a2, a3] = rest.slice(n);
        if (script !== CAS_SCRIPT) throw new Error('sim: unknown script');
        const cur = store.has(k2) ? store.get(k2) : false;
        if ((cur === false && a1 === '') || cur === a1) { store.set(k1, a2); store.set(k2, a3); return 1; }
        return 0;
      }
      if (o === 'SCAN') {                       // SCAN cursor [MATCH p] [COUNT n], in pages of at most 3
        let match = '*';
        for (let i = 2; i < cmd.length; i += 2) if (String(cmd[i]).toLowerCase() === 'match') match = String(cmd[i + 1]);
        const all = [...store.keys()].filter((k) => match.endsWith('*') && k.startsWith(match.slice(0, -1))).sort();
        const at = Number(key) || 0;
        const page = all.slice(at, at + 3);
        const nextAt = at + page.length;
        return [nextAt >= all.length ? '0' : String(nextAt), page];
      }
      return null;
    };
    const url = req.url || '/';
    let out;
    if (url.startsWith('/pipeline') || url.startsWith('/multi-exec')) out = body.map((c) => ({ result: b64 ? enc(one(c)) : one(c) }));
    else out = { result: b64 ? enc(one(body)) : one(body) };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
await new Promise((r) => up.listen(5291, r));
process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:5291';
process.env.UPSTASH_REDIS_REST_TOKEN = 'sim-token';
process.env.GEMINI_API_KEY = 'sim-key';
process.env.IMAGE_DAILY_LIMIT = '3';

// Google's image endpoint, stood in for: a one-pixel PNG, or a failure when the peek says ?gemini=fail
let geminiFails = false;
const realFetch = globalThis.fetch;
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
globalThis.fetch = async (url, opts) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, opts);
  if (geminiFails) return new Response('boom', { status: 500 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PIXEL } }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } });
};
const { CAS_SCRIPT } = await import(pathToFileURL(REPO + '/lib/auth.js').href);

// ---- one account, one session: the same login on both "devices"
store.set('rt:session:SIM1', JSON.stringify({ uid: 'u1', gm: true }));
store.set('rt:user:u1', JSON.stringify({ email: 'sim@example.com', name: 'Sim GM', chars: [] }));
// and a second account, a player, for what needs two people (a table, a join)
store.set('rt:session:SIM2', JSON.stringify({ uid: 'u2', gm: false }));
store.set('rt:user:u2', JSON.stringify({ email: 'player@example.com', name: 'Sim Player', chars: [] }));

const handlers = {};
const load = async (name, file) => (handlers[name] ||= (await import(pathToFileURL(REPO + '/api/' + file).href)).default);

const api = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    log.push(req.method + ' ' + u.pathname + (u.search || ''));
    if (failing && u.pathname === '/api/' + failing && req.method === 'GET') { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'simulated outage' })); return; }
    const parts = u.pathname.replace(/^\/api\//, '').split('/');
    const query = Object.fromEntries(u.searchParams);
    let file = parts[0] + '.js';
    if (parts[0] === 'auth') { file = 'auth/[action].js'; query.action = parts[1]; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
    const handler = await load(parts.join('/'), file);
    const r = Object.assign(req, { query, body, cookies });
    const headers = {};
    let status = 200;
    const out = {
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      getHeader: (k) => headers[k.toLowerCase()],
      status: (n) => { status = n; return out; },
      json: (o) => { headers['content-type'] = 'application/json; charset=utf-8'; res.writeHead(status, headers); res.end(JSON.stringify(o)); },
      end: (s) => { res.writeHead(status, headers); res.end(s); },
      send: (b) => { res.writeHead(status, headers); res.end(b); },
      redirect: (a, b) => { res.writeHead(typeof a === 'number' ? a : 302, { location: typeof a === 'number' ? b : a }); res.end(); }
    };
    await handler(r, out);
  } catch (e) {
    console.error('[sim-api]', req.url, (e && e.stack) || e);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
});
await new Promise((r) => api.listen(5290, r));
console.log('sim api up');

// a peek into the fake database for the test
const peek = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams;
  res.writeHead(200, { 'content-type': 'application/json' });
  if (q.get('wipe')) {                         // what the old sign-in callback did
    const rec = JSON.parse(store.get('rt:user:u1'));
    store.set('rt:user:u1', JSON.stringify({ email: rec.email, name: rec.name, chars: rec.chars || [] }));
    store.delete('rt:homebrew:u1');            // "the account lost its library" now means its own key too
    return res.end('"wiped"');
  }
  if (q.has('set')) { store.set(q.get('set'), q.get('v')); return res.end('"set"'); }       // seed a key, e.g. a record from before a change
  if (q.has('gemini')) { geminiFails = q.get('gemini') === 'fail'; return res.end(JSON.stringify(geminiFails)); }
  if (q.has('fail')) { failing = q.get('fail') || ''; return res.end(JSON.stringify(failing)); }
  if (q.has('log')) { const out = [...log]; if (q.get('log') === 'clear') log.length = 0; return res.end(JSON.stringify(out)); }
  const k = q.get('k');
  res.end(JSON.stringify(k ? (store.get(k) ?? null) : [...store.keys()]));
});
await new Promise((r) => peek.listen(5292, r));
