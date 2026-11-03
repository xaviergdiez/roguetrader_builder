// The tables an account belongs to are remembered on its record, through the same
// compare-and-set as everything else: tables opened at once are all remembered, and
// joining and leaving updates the player's own record.
import { call, record, check, finish } from './lib.mjs';

console.log('--- a GM opens five tables at once');
const made = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/api/bridge', { action: 'create', name: 'Table ' + i })));
check(made.every((r) => r.status === 200 && r.json && r.json.dynasty), 'all five are created: ' + made.map((r) => r.status).join(','));
const codes = made.map((r) => r.json.dynasty.code);
check(new Set(codes).size === 5, 'with five different codes');
let rec = await record('u1');
check((rec.dynasties || []).length === 5 && codes.every((c) => rec.dynasties.includes(c)), `the account remembers all five: ${(rec.dynasties || []).length}/5`);

console.log('--- a player joins and leaves');
const code = codes[0];
let r = await call('POST', '/api/bridge', { action: 'join', code, name: 'Zed', charId: 'c-zed', role: 'first_officer' }, 'SIM2');
check(r.status === 200, 'the join is accepted: ' + r.status + ' ' + JSON.stringify(r.json && r.json.error || ''));
rec = await record('u2');
check((rec.dynasties || []).includes(code), 'the player’s own record remembers the table');
check(rec.email === 'player@example.com', 'and keeps its identity');
r = await call('POST', '/api/bridge', { action: 'leave', code }, 'SIM2');
check(r.status === 200, 'leaving is accepted');
rec = await record('u2');
check(!(rec.dynasties || []).includes(code), 'and the table is forgotten');

console.log('--- the GM cannot leave their own table');
r = await call('POST', '/api/bridge', { action: 'leave', code }, 'SIM1');
check(r.status === 409, 'refused with 409');
rec = await record('u1');
check(rec.dynasties.includes(code), 'and it is still remembered');
finish();
