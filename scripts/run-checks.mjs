// Runs every self-check: src/*.check.mjs and lib/*.check.mjs. Prints one line each, the output
// of any that fail, and exits non-zero if one did. Usage: node scripts/run-checks.mjs
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = ['src', 'lib'].flatMap((d) => readdirSync(root + d).filter((f) => f.endsWith('.check.mjs')).map((f) => `${d}/${f}`)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [root + f], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) continue;
  failed++;
  console.log(`FAIL ${f}\n${(r.stdout || '') + (r.stderr || '')}`.split('\n').slice(0, 30).join('\n'));
}
console.log(failed ? `${failed} of ${files.length} checks FAILED` : `all ${files.length} checks passed`);
process.exit(failed ? 1 : 0);
