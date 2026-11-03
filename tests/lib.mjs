// What the API tests share: a way to talk to the simulator (tests/sim-api.mjs) as the signed-in GM.
export const API = 'http://127.0.0.1:5290';
export const PEEK = 'http://127.0.0.1:5292';
const head = (sid) => ({ 'Content-Type': 'application/json', cookie: 'sid=' + sid });

let failed = false;
export const check = (cond, msg) => {
  if (!cond) { failed = true; console.log('  FAIL', msg); } else console.log('  ok  ', msg);
};
export const finish = () => { process.exit(failed ? 1 : 0); };

export const peek = async (q = '') => (await fetch(`${PEEK}/?${q}`)).json();
export const record = async (uid = 'u1') => JSON.parse(await peek('k=' + encodeURIComponent('rt:user:' + uid)) || 'null');
export const call = (method, path, body, sid = 'SIM1') =>
  fetch(API + path, { method, headers: head(sid), body: body === undefined ? undefined : JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
export const IMAGE = 'data:image/png;base64,' + 'A'.repeat(60);
export const library = (...hulls) => ({
  hulls: hulls.map((id) => ({ id, name: 'Hull ' + id })), components: [], encounters: [], endeavours: [],
  battlemaps: [], mapgrounds: [], voidcharts: []
});
