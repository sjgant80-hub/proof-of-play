// gate.test.mjs — the tests the gate did not have.
//
// ⚑ THE GATE THAT JUDGES EVERYONE ELSE WAS NOT GATED ITSELF. proof-of-play sat at "works": ten tests,
// green, no mutation gate. Run witness over it and 21 of 34 mutants survived — 38% killed. The tool
// whose whole claim is "no listing without a reproducible, un-forgeable pass" had no un-forgeable
// pass of its own.
//
// ⚑ AND ITS ANTI-FORGERY TEST PASSED FOR THE WRONG REASON. The suite has a test named "THE
// anti-forgery property", and it does pass — by tripping the HASH check. The dedicated
// admissibility-overclaim guard below it is never reached, so deleting that guard broke nothing and
// no test noticed. To reach it you need a proof whose hash still matches while the verdict no longer
// supports the claim, which is exactly what a lax minting policy produces.
//
// These tests reach the branches the original ten stepped over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { proveRepo, verify, filterListings, assessorRunner, defaultPolicy } from './filter.mjs';

// A benchmark stub. Deterministic, and every field the real one produces.
const stub = (over = {}) => (repoPath) => ({
  badge: true, hash: 'h:' + repoPath, spec: 'acg-1', specFingerprint: 'fp-1',
  summary: { core: 10, nonCore: 2 }, dominantTell: null, ...over,
});

test('⚑ a lax policy cannot smuggle a listing past verification', () => {
  // Mint with a policy that admits anything — the hash is genuine, the claim is not.
  const failing = stub({ badge: false });
  const proof = proveRepo('repo-a', { assess: failing, policy: () => true });
  assert.equal(proof.admissible, true, 'the lax policy minted an admissible proof');
  assert.equal(proof.verdict.badge, false, 'even though the repo did not earn the badge');

  // The hash still reproduces, so the hash check passes. Only the overclaim guard can catch this.
  const v = verify(proof, 'repo-a', { assess: failing });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'admissibility-overclaim',
    'caught by the overclaim guard, not by the hash — this is the branch the original suite never reached');
});

test('an honest non-admissible proof verifies fine — the guard is about the CLAIM, not the verdict', () => {
  const failing = stub({ badge: false });
  const proof = proveRepo('repo-a', { assess: failing });      // default policy → admissible false
  assert.equal(proof.admissible, false);
  assert.equal(verify(proof, 'repo-a', { assess: failing }).ok, true,
    'a repo is allowed to fail; what it may not do is claim it passed');
});

test('a proof carries the verdict, not just the badge', () => {
  const proof = proveRepo('repo-a', { assess: stub() });
  assert.equal(proof.verdict.core, 10);
  assert.equal(proof.verdict.nonCore, 2);
  assert.equal(proof.benchmark.spec, 'acg-1');
  assert.equal(proof.benchmark.fingerprint, 'fp-1');
  assert.equal(proof.repo, 'repo-a', 'and the repo is named by its basename');
});

test('a repo path with a trailing separator names the same repo', () => {
  assert.equal(proveRepo('some/where/repo-a/', { assess: stub() }).repo, 'repo-a');
  assert.equal(proveRepo('some/where/repo-a', { assess: stub() }).repo, 'repo-a');
});

test('provedAt is metadata and never part of the trust check', () => {
  const withTime = proveRepo('repo-a', { assess: stub(), provedAt: '2026-08-14' });
  const without = proveRepo('repo-a', { assess: stub() });
  assert.equal(withTime.provedAt, '2026-08-14');
  assert.equal('provedAt' in without, false, 'absent when not supplied, rather than a null nobody can read');
  assert.equal(withTime.hash, without.hash, 'and it cannot move the hash');
});

test('⚑ a benchmark that throws is reported, never treated as a pass', () => {
  const explode = () => { throw new Error('assessor exploded'); };
  const v = verify({ hash: 'h:repo-a' }, 'repo-a', { assess: explode });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'benchmark-error');
  assert.match(v.detail, /exploded/, 'with the reason, so a broken benchmark is not mistaken for a bad repo');
});

test('a proof with no hash is malformed, whatever else it carries', () => {
  for (const bad of [null, undefined, 'x', 42, {}, { admissible: true }, { hash: '' }]) {
    const v = verify(bad, 'repo-a', { assess: stub() });
    assert.equal(v.ok, false, `${JSON.stringify(bad)} must not verify`);
    assert.equal(v.reason, 'malformed-proof');
  }
});

test('⚑ a benchmark verdict missing its hash or badge is refused, not defaulted', () => {
  // A verdict with no hash cannot anchor anything; one with no badge cannot be judged.
  assert.throws(() => proveRepo('repo-a', { assess: stub({ hash: null }) }), /verdict/i);
  assert.throws(() => proveRepo('repo-a', { assess: stub({ badge: null }) }), /verdict/i);
  assert.doesNotThrow(() => proveRepo('repo-a', { assess: stub({ badge: false }) }),
    'while badge:false is a real verdict and must be allowed through');
});

test('the fingerprint check only fires when both sides carry one', () => {
  const proof = proveRepo('repo-a', { assess: stub() });
  assert.equal(verify(proof, 'repo-a', { assess: stub({ specFingerprint: 'fp-2' }) }).reason,
    'benchmark-version-changed');
  // an older proof with no fingerprint is not rejected for lacking one
  const legacy = { ...proof, benchmark: { spec: 'acg-1', fingerprint: null } };
  assert.equal(verify(legacy, 'repo-a', { assess: stub() }).ok, true,
    'a proof minted before fingerprints existed still verifies on its hash');
});

test('⚑ a listing resolves by repoPath, then by repo, and is rejected when it has neither', () => {
  const listings = [
    { name: 'by path', repoPath: 'repo-a' },
    { name: 'by repo', repo: 'repo-b' },
    { name: 'by nothing' },
  ];
  const r = filterListings(listings, { assess: stub() });
  assert.equal(r.admitted.length, 2);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].reason, 'no-repo', 'a listing with nowhere to look is refused, not assumed good');
  assert.equal(r.total, 3, 'and the total counts every listing that was considered');
});

test('a listing whose benchmark throws is rejected as unresolvable, not admitted', () => {
  const bomb = (p) => { if (p === 'repo-b') throw new Error('nope'); return stub()(p); };
  const r = filterListings([{ repo: 'repo-a' }, { repo: 'repo-b' }], { assess: bomb });
  assert.equal(r.admitted.length, 1);
  assert.equal(r.rejected[0].reason, 'unresolvable');
  assert.match(r.rejected[0].detail, /nope/);
  assert.equal(r.proofs.length, 1, 'and no proof is minted for the one that could not be assessed');
});

test('every listing considered yields a proof or a reason — nothing vanishes', () => {
  const listings = [{ repo: 'a' }, { repo: 'b' }, {}, { repo: 'c' }];
  const r = filterListings(listings, { assess: stub({ badge: false }) });
  assert.equal(r.admitted.length + r.rejected.length, listings.length,
    'the two piles account for every listing — a gate that loses one has admitted it by accident');
});

test('the default policy is the badge, and nothing else', () => {
  assert.equal(defaultPolicy({ verdict: { badge: true } }), true);
  assert.equal(defaultPolicy({ verdict: { badge: false } }), false);
  assert.equal(defaultPolicy({ verdict: { badge: 'true' } }), false,
    '⚑ the string "true" is not a badge — a benchmark emitting text must not be read as a pass');
});

test('⚑ assessorRunner reports an empty benchmark rather than treating silence as a verdict', () => {
  // A runner pointed at something that produces nothing must not quietly succeed.
  const runner = assessorRunner('definitely-not-a-real-assessor-path.mjs');
  assert.throws(() => runner('repo-a'), /benchmark/i,
    'no output is an error — silence is the easiest thing in the world to forge');
});

// ── the command line, which no test had ever touched ────────────────────────
import { parseArgs } from './filter.mjs';

test('⚑ the --assessor flag is actually read', () => {
  const { arg } = parseArgs(['node', 'filter.mjs', 'prove', 'repo-a', '--assessor', 'other.mjs']);
  assert.equal(arg('--assessor', 'default.mjs'), 'other.mjs',
    'a flag that silently stops being read still prints a confident verdict, from the wrong benchmark');
  assert.equal(arg('--missing', 'fallback'), 'fallback', 'and an absent flag falls back');
});

test('the flag takes the value AFTER it, not the flag itself', () => {
  const { arg } = parseArgs(['node', 'f', 'prove', '--assessor', 'the-value']);
  assert.equal(arg('--assessor'), 'the-value',
    '⚑ off by one here means every run is assessed by a file named "--assessor"');
});

test('the command is the third argument, because the first two are node and the script', () => {
  assert.equal(parseArgs(['node', 'filter.mjs', 'prove', 'repo']).cmd, 'prove');
  assert.equal(parseArgs(['node', 'filter.mjs', 'verify']).cmd, 'verify');
  assert.equal(parseArgs(['node', 'filter.mjs', 'filter']).cmd, 'filter');
  assert.equal(parseArgs(['node', 'filter.mjs']).cmd, undefined, 'and no command is no command');
});

test('garbage argv parses to nothing rather than throwing', () => {
  for (const bad of [null, undefined, 'x', 42, {}]) {
    const { cmd, arg } = parseArgs(bad);
    assert.equal(cmd, undefined);
    assert.equal(arg('--anything', 'd'), 'd');
  }
});

test('⚑ an error with no message still reports something', () => {
  // String(e.message || e) — an object thrown without a message must not become "undefined".
  const bomb = () => { throw { toString: () => 'a thrown thing' }; };
  const v = verify({ hash: 'h' }, 'repo-a', { assess: bomb });
  assert.equal(v.reason, 'benchmark-error');
  assert.equal(v.detail, 'a thrown thing', 'the reason falls back to the value itself, never to undefined');

  const r = filterListings([{ repo: 'a' }], { assess: bomb });
  assert.equal(r.rejected[0].detail, 'a thrown thing', 'and the same in the gate');
});

test('⚑ a verdict that is not an object at all is refused', () => {
  for (const bad of [null, undefined, 'a string', 42, true]) {
    assert.throws(() => proveRepo('repo-a', { assess: () => bad }), /verdict/i,
      `${JSON.stringify(bad)} is not a verdict and must not mint a proof`);
  }
});
