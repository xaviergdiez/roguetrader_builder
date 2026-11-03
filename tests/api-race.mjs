// Saves made at the same moment must not erase one another's index entries.
// The real handlers on a fake database; a burst of a deck, a ground, a character and the
// homebrew library at once, repeatedly, then every entry must be on the account.
// (Before updateUser, every such burst lost entries: the bodies stayed stored, unlisted.)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { call, record, peek, check, finish, IMAGE, library } from './lib.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const m = await import(pathToFileURL(REPO + 'src/battlemap.js').href);
const ROUNDS = 8;

console.log('--- bursts of four saves at once');
for (let i = 0; i < ROUNDS; i++) {
  const d = m.newBattleMap('Deck ' + i);
  const out = await Promise.all([
    call('PUT', '/api/decks?d=' + d.id, { name: 'Deck ' + i, map: m.packMap(m.readMap(d.map)) }),
    call('PUT', '/api/grounds?g=g' + i, { name: 'Ground ' + i, texture: IMAGE }),
    call('PUT', '/api/characters?c=c' + i, { name: 'Char ' + i, state: { x: 1 } }),
    call('PUT', '/api/homebrew', { homebrew: library('h' + i) })
  ]);
  check(out.every((r) => r.status === 200), `round ${i}: all four answered 200 (${out.map((r) => r.status).join(',')})`);
}
const rec = await record();
check((rec.decks || []).length === ROUNDS, `every deck is listed: ${(rec.decks || []).length}/${ROUNDS}`);
check((rec.grounds || []).length === ROUNDS, `every ground is listed: ${(rec.grounds || []).length}/${ROUNDS}`);
check((rec.chars || []).length === ROUNDS, `every character is listed: ${(rec.chars || []).length}/${ROUNDS}`);
const keys = await peek('');
check(keys.filter((k) => k.startsWith('rt:deck:u1:')).length === ROUNDS, 'and every deck body is stored');
const hb = await call('GET', '/api/homebrew');
check(hb.json.homebrew.hulls.length === 1 && /^h\d$/.test(hb.json.homebrew.hulls[0].id), 'the library is there (the last save wins, as it always did)');
check(!('homebrew' in rec), 'and is no longer carried on the account record');
check(!!rec.email, 'the identity is still there');

console.log('--- ten saves of one kind at once');
const before = (await record()).decks.length;
const ten = await Promise.all(Array.from({ length: 10 }, (_, i) => {
  const d = m.newBattleMap('Many ' + i);
  return call('PUT', '/api/decks?d=' + d.id, { name: 'Many ' + i, map: m.packMap(m.readMap(d.map)) });
}));
const ok = ten.filter((r) => r.status === 200).length;
const busy = ten.filter((r) => r.status === 503).length;
const now = (await record()).decks.length;
check(ok + busy === 10, `each answered 200 or 503 account_busy (${ok} saved, ${busy} told to retry)`);
check(now - before === ok, `exactly the ${ok} that answered 200 are listed (${now - before})`);
check(ten.filter((r) => r.status === 503).every((r) => r.json && r.json.error === 'account_busy'), 'and a refusal says why');
finish();
