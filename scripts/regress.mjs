// The regression: runs every suite under tests/ (each tests/<dir>/<name>.mjs but the lib.mjs helpers and
// tests/bastions/render.mjs), several at a time, each in its own node process that is killed after a timeout
// (a hung suite shows up as "killed"). Each suite's output goes to <out>/<path with / as _>.out; the summary
// lists ok/FAIL counts per suite and the failures, and the exit status is 1 if any suite failed.
//
// usage: node scripts/regress.mjs [-j 4] [--timeout 900] [--out tmp/regress/<time>] [suite.mjs ...]

import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync, createWriteStream, readFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
let jobs = Math.max(1, Math.min(4, cpus().length - 1));
let timeout = 900;
let out = join('tmp', 'regress', new Date().toISOString().replace(/[:.]/g, '-'));
const given = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-j') jobs = +args[++i];
  else if (args[i] === '--timeout') timeout = +args[++i];
  else if (args[i] === '--out') out = args[++i];
  else given.push(args[i]);
}

const HELPERS = new Set(['lib.mjs', 'render.mjs']);
const suites = given.length ? given : readdirSync('tests', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(join('tests', d.name)).filter((f) => f.endsWith('.mjs') && !HELPERS.has(f)).map((f) => `tests/${d.name}/${f}`))
  .sort();
for (const s of suites) if (!existsSync(s)) { console.error(`no such suite: ${s}`); process.exit(2); }
mkdirSync(out, { recursive: true });
console.log(`${suites.length} suites, ${jobs} at a time, ${timeout} s each at most; output in ${out}`);

const outFile = (s) => join(out, s.replace(/\//g, '_') + '.out');
const results = new Map();
const t0 = Date.now();

function run(suite) {
  return new Promise((resolve) => {
    const start = Date.now();
    const log = createWriteStream(outFile(suite));
    const child = spawn(process.execPath, [suite], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeout * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      log.end(`\nexit=${code ?? signal}${killed ? ' (killed after the timeout)' : ''}\n`, () => {
        const text = readFileSync(outFile(suite), 'utf8');
        const lines = text.split('\n');
        const ok = lines.filter((l) => l.startsWith('ok')).length;
        const fails = lines.filter((l) => l.startsWith('FAIL'));
        const last = lines.filter((l) => l.trim() && !l.startsWith('exit=')).pop() ?? '';
        const passed = code === 0 && !fails.length && !killed;
        const r = { suite, ok, fails, code, killed, passed, last, secs: (Date.now() - start) / 1000 };
        results.set(suite, r);
        console.log(`${passed ? 'pass' : 'FAIL'} ${suite} (ok ${ok}, FAIL ${fails.length}, ${killed ? 'killed' : `exit ${code}`}, ${r.secs.toFixed(0)} s)`);
        resolve();
      });
    });
  });
}

const queue = [...suites];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) await run(queue.shift());
}));

const failed = suites.map((s) => results.get(s)).filter((r) => !r.passed);
console.log(`\n${suites.length - failed.length} of ${suites.length} suites passed in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
for (const r of failed) {
  console.log(`\nFAILED ${r.suite}: ${r.killed ? 'killed after the timeout' : `exit ${r.code}`}, last line: ${r.last.slice(0, 160)}`);
  for (const f of r.fails.slice(0, 8)) console.log(`  ${f.slice(0, 200)}`);
}
process.exit(failed.length ? 1 : 0);
