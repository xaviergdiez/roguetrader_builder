// Runs the browser tests (tests/e2e). Needs Chrome (set CHROME to use another binary).
// Starts the API simulator fresh for each file and one dev server for all of them.
// Usage: node tests/run-e2e.mjs [name-fragment]     e.g.  node tests/run-e2e.mjs weapon
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));
const only = process.argv[2] || '';
const files = readdirSync(here + 'e2e').filter((f) => f.endsWith('.mjs') && f !== 'cdp.mjs' && f.includes(only)).sort();
const ready = (proc, text, ms = 30000) => new Promise((resolve, reject) => {
  const on = (b) => { if (String(b).includes(text)) resolve(); };
  proc.stdout.on('data', on); proc.stderr && proc.stderr.on('data', on);
  proc.on('exit', () => reject(new Error(`exited before "${text}"`)));
  setTimeout(() => reject(new Error(`no "${text}" within ${ms}ms`)), ms);
});

const vite = spawn(process.execPath, [root + 'node_modules/vite/bin/vite.js', '--config', here + 'vite.e2e.config.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let failed = 0;
try {
  await ready(vite, 'localhost:5201');
  for (const f of files) {
    const sim = spawn(process.execPath, [here + 'sim-api.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
    await ready(sim, 'sim api up', 15000);
    console.log(`\n=== ${f}`);
    const code = await new Promise((resolve) => spawn(process.execPath, [here + 'e2e/' + f], { stdio: 'inherit' }).on('exit', resolve));
    sim.kill();
    if (code !== 0) failed++;
  }
} finally { vite.kill(); }
console.log(failed ? `\n${failed} of ${files.length} browser test files FAILED` : `\nall ${files.length} browser test files passed`);
process.exit(failed ? 1 : 0);
