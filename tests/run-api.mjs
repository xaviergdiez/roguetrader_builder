// Runs the API tests: starts the simulator (tests/sim-api.mjs) fresh for each file, runs it, stops it.
// No browser needed. Usage: node tests/run-api.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter((f) => /^api-.*\.mjs$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const sim = spawn(process.execPath, [dir + 'sim-api.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    sim.stdout.on('data', (b) => { if (String(b).includes('sim api up')) resolve(); });
    sim.on('exit', () => reject(new Error('the simulator exited early')));
    setTimeout(() => reject(new Error('the simulator did not start')), 15000);
  });
  console.log(`\n=== ${f}`);
  const code = await new Promise((resolve) => spawn(process.execPath, [dir + f], { stdio: 'inherit' }).on('exit', resolve));
  sim.kill();
  if (code !== 0) failed++;
}
console.log(failed ? `\n${failed} of ${files.length} API test files FAILED` : `\nall ${files.length} API test files passed`);
process.exit(failed ? 1 : 0);
