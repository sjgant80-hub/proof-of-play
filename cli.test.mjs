// cli.test.mjs — the command line, exercised for real.
//
// ⚑ THESE COULD HAVE BEEN BASELINED AND WERE NOT. Sixteen mutants survived inside cli(), and every
// one of them was reachable — the body reads files, parses JSON and prints verdicts, so the honest
// options were to test it or to ship the gate not-clean and say so. "We did not test this" is not an
// equivalence argument, and writing it into a baseline would be exactly the test-theatre this repo
// exists to catch. So: real files, a real assessor on disk, real output captured.
//
// ⚑ AND SIX OF THESE FAILED FIRST TIME, ALL OF THEM MY FAULT, NOT THE CLI'S. I wrote them against
// what I assumed the commands looked like: that filter took its root as a positional (it is a --root
// flag), that the reason was printed lowercase (it is uppercased), that verify with one argument
// missing would complain (it needs both missing, because a flag filled the slot). Reading the code
// first would have cost a minute. Assuming an interface and then "fixing" the code to match is how a
// test suite ends up pinning something nobody asked for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, assessorRunner } from './filter.mjs';

// A stand-in benchmark: prints a verdict for any repo, and fails the one called "bad".
const ASSESSOR = `
const repo = process.argv[2] || '';
const bad = /bad/.test(repo);
process.stdout.write(JSON.stringify({
  badge: !bad, hash: 'h:' + repo.split(/[\\\\/]/).filter(Boolean).pop(),
  spec: 'acg-1', specFingerprint: 'fp-1', summary: { core: 9, nonCore: 1 }, dominantTell: null,
}));
`;

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'pop-cli-'));
  const assessor = join(dir, 'assessor.mjs');
  writeFileSync(assessor, ASSESSOR);
  for (const name of ['good-repo', 'bad-repo']) mkdirSync(join(dir, name), { recursive: true });
  return { dir, assessor };
}

/** Run cli() with output captured and process.exit neutralised. */
function run(argv) {
  const out = [], err = [];
  const log = console.log, error = console.error, exit = process.exit;
  let code = 0;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  process.exit = (c) => { code = c ?? 0; throw { __exit: true }; };
  try { cli(argv); } catch (e) { if (!e || !e.__exit) { err.push(String((e && e.message) || e)); code = 1; } }
  finally { console.log = log; console.error = error; process.exit = exit; }
  return { out: out.join('\n'), err: err.join('\n'), code };
}

test('⚑ prove mints a proof for the named repo', () => {
  const { dir, assessor } = workspace();
  const r = run(['node', 'filter.mjs', 'prove', join(dir, 'good-repo'), '--assessor', assessor]);
  const proof = JSON.parse(r.out);
  assert.equal(proof.repo, 'good-repo');
  assert.equal(proof.admissible, true);
  assert.equal(proof.hash, 'h:good-repo', 'anchored on the benchmark verdict, not on anything the CLI made up');
  rmSync(dir, { recursive: true, force: true });
});

test('prove on a failing repo mints a proof that is NOT admissible', () => {
  const { dir, assessor } = workspace();
  const r = run(['node', 'filter.mjs', 'prove', join(dir, 'bad-repo'), '--assessor', assessor]);
  assert.equal(JSON.parse(r.out).admissible, false, 'a failing repo still gets a proof — of failing');
  rmSync(dir, { recursive: true, force: true });
});

test('⚑ verify accepts an authentic proof and rejects a doctored one', () => {
  const { dir, assessor } = workspace();
  const repo = join(dir, 'good-repo');
  const proof = JSON.parse(run(['node', 'f', 'prove', repo, '--assessor', assessor]).out);
  const path = join(dir, 'proof.json');

  writeFileSync(path, JSON.stringify(proof));
  assert.equal(run(['node', 'f', 'verify', path, repo, '--assessor', assessor]).code, 0, 'the real proof verifies');

  // change one character of the hash — the anchor the whole claim rests on
  writeFileSync(path, JSON.stringify({ ...proof, hash: 'h:something-else' }));
  const bad = run(['node', 'f', 'verify', path, repo, '--assessor', assessor]);
  assert.notEqual(bad.code, 0, '⚑ and a doctored one exits non-zero — a gate that returns success on a forgery is not a gate');
  assert.match(bad.out + bad.err, /HASH-MISMATCH/i);
  rmSync(dir, { recursive: true, force: true });
});

test('verify without both arguments explains itself instead of guessing', () => {
  const { dir, assessor } = workspace();
  const r = run(['node', 'f', 'verify']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /usage/i, 'a missing argument is a usage error, never a pass');
  rmSync(dir, { recursive: true, force: true });
});

test('⚑ filter partitions a listing file and says which side each landed on', () => {
  const { dir, assessor } = workspace();
  const listings = join(dir, 'listings.json');
  writeFileSync(listings, JSON.stringify([{ repo: 'good-repo' }, { repo: 'bad-repo' }]));
  const r = run(['node', 'f', 'filter', listings, '--root', dir, '--assessor', assessor]);
  assert.match(r.out, /listings: 2/);
  assert.match(r.out, /admitted: 1/);
  assert.match(r.out, /rejected: 1/);
  assert.ok(r.out.includes('✗ bad-repo') && r.out.includes('failed-benchmark'),
    'the failing one is NAMED with its reason');
  assert.ok(!r.out.includes('good-repo'),
    '⚑ and the admitted one is NOT named — that is the design: a gate is read for what it turned away, and printing every pass buries the refusals');
  rmSync(dir, { recursive: true, force: true });
});

test('a listings file may be an array or an object with a listings key', () => {
  const { dir, assessor } = workspace();
  const wrapped = join(dir, 'wrapped.json');
  writeFileSync(wrapped, JSON.stringify({ listings: [{ repo: 'good-repo' }] }));
  const r = run(['node', 'f', 'filter', wrapped, '--root', dir, '--assessor', assessor]);
  assert.match(r.out, /listings: 1/,
    '⚑ both shapes are read — a wrapper key silently yielding ZERO listings would admit nothing and print a clean run');
  rmSync(dir, { recursive: true, force: true });
});

test('a listing names itself by repo, or failing that by name', () => {
  const { dir, assessor } = workspace();
  const f = join(dir, 'byname.json');
  writeFileSync(f, JSON.stringify([{ name: 'good-repo' }]));
  const r = run(['node', 'f', 'filter', f, '--root', dir, '--assessor', assessor]);
  assert.match(r.out, /listings: 1 .* admitted: 1/, 'a listing with only a name is still resolved and still counted');
  rmSync(dir, { recursive: true, force: true });
});

test('an unknown command is refused rather than doing something', () => {
  const r = run(['node', 'filter.mjs', 'destroy-everything']);
  assert.notEqual(r.code, 0);
  assert.match(r.err + r.out, /commands: prove, verify, filter/);
});

test('⚑ verify complains when EITHER argument is missing, not only when both are', () => {
  const r = run(['node', 'f', 'verify', 'only-a-proof.json']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /usage/i,
    'a check that fires only when both are absent lets a half-typed command through to read a file that is not there');
});

test('⚑ a rejected listing with only a name is still named in the output', () => {
  const { dir, assessor } = workspace();
  const f = join(dir, 'named-bad.json');
  writeFileSync(f, JSON.stringify([{ name: 'bad-repo' }]));   // fails the benchmark, has no repo key
  const r = run(['node', 'f', 'filter', f, '--root', dir, '--assessor', assessor]);
  assert.ok(r.out.includes('bad-repo'),
    'the refusal names it by whatever it had — a listing rejected as "?" is a listing nobody can go and fix');
  rmSync(dir, { recursive: true, force: true });
});

test('⚑ the PROOF_ASSESSOR environment variable is actually read', () => {
  // The assessor path never appears in an error message — those name the REPO — so the only way to
  // observe which benchmark was used is to point the variable at one that works and see a verdict.
  const { dir, assessor } = workspace();
  const saved = process.env.PROOF_ASSESSOR;
  process.env.PROOF_ASSESSOR = assessor;
  try {
    const v = assessorRunner()(join(dir, 'good-repo'));
    assert.equal(v.hash, 'h:good-repo',
      'with no path passed in, the runner takes the one from the environment — losing that silently assesses with the built-in default instead');
  } finally {
    if (saved === undefined) delete process.env.PROOF_ASSESSOR; else process.env.PROOF_ASSESSOR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an explicit path beats the environment', () => {
  const { dir, assessor } = workspace();
  const saved = process.env.PROOF_ASSESSOR;
  process.env.PROOF_ASSESSOR = join(dir, 'does-not-exist.mjs');
  try {
    const v = assessorRunner(assessor)(join(dir, 'good-repo'));
    assert.equal(v.hash, 'h:good-repo', 'the argument wins, which is what --assessor depends on');
  } finally {
    if (saved === undefined) delete process.env.PROOF_ASSESSOR; else process.env.PROOF_ASSESSOR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('⚑ a benchmark that prints a verdict missing its hash is refused at the runner', () => {
  const { dir } = workspace();
  const half = join(dir, 'half.mjs');
  writeFileSync(half, `process.stdout.write(JSON.stringify({ badge: true }));`);
  const runner = assessorRunner(half);
  assert.throws(() => runner(join(dir, 'good-repo')), /lacks badge\/hash/,
    'a verdict with no hash anchors nothing, and the runner is the first place that can say so');
  rmSync(dir, { recursive: true, force: true });
});

test('a benchmark that prints nothing reports the empty output, not a mystery', () => {
  const { dir } = workspace();
  const silent = join(dir, 'silent.mjs');
  writeFileSync(silent, `process.exit(0);`);
  const runner = assessorRunner(silent);
  assert.throws(() => runner(join(dir, 'good-repo')), /produced no verdict/,
    '⚑ silence is the easiest thing in the world to forge, so it is an error and never a pass');
  rmSync(dir, { recursive: true, force: true });
});

test('⚑ a silent benchmark is distinguished from a crashed one', () => {
  const { dir } = workspace();
  const silent = join(dir, 'silent.mjs');
  writeFileSync(silent, `process.exit(0);`);            // no output, no error
  try { assessorRunner(silent)(join(dir, 'good-repo')); assert.fail('should have thrown'); }
  catch (e) {
    assert.match(e.message, /unknown/,
      'a benchmark that printed nothing and said nothing is reported as "unknown" — an empty detail reads as though nothing went wrong');
  }
  const noisy = join(dir, 'noisy.mjs');
  writeFileSync(noisy, `process.stderr.write('cannot find the repo'); process.exit(1);`);
  try { assessorRunner(noisy)(join(dir, 'good-repo')); assert.fail('should have thrown'); }
  catch (e) { assert.match(e.message, /cannot find the repo/, 'and one that complained has its complaint carried through'); }
  rmSync(dir, { recursive: true, force: true });
});
