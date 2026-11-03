// Self-check for the saved-work file the error screen offers. Run: node src/recovery.check.mjs
import assert from 'node:assert/strict';
import { savedWork, savedWorkName, errorLine, SAVED_PREFIX } from './recovery.js';

const fake = (entries, { throwOn = [] } = {}) => {
  const ks = Object.keys(entries);
  return {
    get length() { return ks.length; },
    key: (i) => ks[i] ?? null,
    getItem: (k) => { if (throwOn.includes(k)) throw new Error('blocked'); return entries[k] ?? null; }
  };
};

// only this app's keys, and their values as stored
const work = savedWork(fake({ 'rt:current': '{"a":1}', 'rt:chars': '[]', 'theme': 'dark', 'other:x': '1' }), Date.UTC(2026, 10, 3));
assert.deepEqual(work.keys, { 'rt:current': '{"a":1}', 'rt:chars': '[]' });
assert.equal(work.app, 'roguetrader-builder');
assert.equal(work.savedAt, '2026-11-03T00:00:00.000Z');
assert.equal(SAVED_PREFIX, 'rt:');

// one key that cannot be read does not cost the others
assert.deepEqual(savedWork(fake({ 'rt:a': '1', 'rt:b': '2' }, { throwOn: ['rt:a'] })).keys, { 'rt:b': '2' });
// storage that throws altogether gives an empty file, not an error inside the error screen
assert.deepEqual(savedWork({ get length() { throw new Error('denied'); } }).keys, {});
assert.deepEqual(savedWork(fake({})).keys, {});

assert.equal(savedWorkName(Date.UTC(2026, 10, 3, 15)), 'roguetrader-saved-work-2026-11-03.json');

assert.equal(errorLine(new TypeError('x.map is not a function')), 'x.map is not a function');
assert.equal(errorLine('plain'), 'plain');
assert.equal(errorLine(null), 'unknown error');
assert.equal(errorLine(new Error('a\n  b')).includes('\n'), false);
assert.equal(errorLine(new Error('z'.repeat(500))).length, 200);

console.log('recovery: all checks passed');
