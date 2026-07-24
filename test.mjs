#!/usr/bin/env node
// ═══ PROOF-OF-PLAY TEST SUITE ═══
// The benchmark is injectable, so these tests use a controllable fake benchmark — no dependency
// on any external repo. The load-bearing test is the un-forgeable property: a proof claiming a
// pass the repo does not produce must fail verification.
// Usage: node test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proveRepo, verify, filterListings, defaultPolicy, PROOF_VERSION } from './filter.mjs';

// A fake benchmark: maps a repo path to a fixed verdict. Deterministic, like the real assessor.
function fakeBenchmark(verdicts) {
  return (repoPath) => {
    const v = verdicts[repoPath];
    if (!v) throw new Error(`no such repo: ${repoPath}`);
    return v;
  };
}
const PASS = { badge: true, hash: 'aaaa1111', spec: 'assessor-v0.7', specFingerprint: 'fp-1', summary: { core: '10/10', nonCore: '14/14' }, dominantTell: null };
const FAIL = { badge: false, hash: 'bbbb2222', spec: 'assessor-v0.7', specFingerprint: 'fp-1', summary: { core: '7/10', nonCore: '9/14' }, dominantTell: 'UNOPENED' };
const assess = fakeBenchmark({ '/good': PASS, '/bad': FAIL });

test('a passing repo mints an admissible proof carrying the verdict hash', () => {
  const p = proveRepo('/good', { assess });
  assert.equal(p.v, PROOF_VERSION);
  assert.equal(p.repo, 'good');
  assert.equal(p.admissible, true);
  assert.equal(p.verdict.badge, true);
  assert.equal(p.hash, 'aaaa1111');
  assert.equal(p.benchmark.spec, 'assessor-v0.7');
});

test('a failing repo mints a NON-admissible proof — no listing without a pass', () => {
  const p = proveRepo('/bad', { assess });
  assert.equal(p.admissible, false);
  assert.equal(p.verdict.badge, false);
  assert.equal(p.verdict.dominantTell, 'UNOPENED');
});

test('an authentic proof verifies — re-running the benchmark reproduces the hash', () => {
  const p = proveRepo('/good', { assess });
  assert.deepEqual(verify(p, '/good', { assess }), { ok: true, reason: 'authentic' });
});

test('THE anti-forgery property: a proof claiming a pass the repo does not produce is rejected', () => {
  // forge: take the failing repo, paste in the passing repo's hash + flip admissible.
  const forged = { ...proveRepo('/bad', { assess }), hash: 'aaaa1111', admissible: true, verdict: { ...PASS } };
  const r = verify(forged, '/bad', { assess });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'hash-mismatch');
  assert.equal(r.claimed, 'aaaa1111');   // what the forger asserted
  assert.equal(r.actual, 'bbbb2222');    // what the repo actually produces
});

test('a proof does not transfer between repos — the hash is repo-specific', () => {
  const goodProof = proveRepo('/good', { assess });
  const r = verify(goodProof, '/bad', { assess });   // present a good proof for the bad repo
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'hash-mismatch');
});

test('a stale proof under a changed benchmark version is rejected', () => {
  const p = proveRepo('/good', { assess });
  // the benchmark bumps: same badge, but a different fingerprint AND a different verdict hash
  const bumped = fakeBenchmark({ '/good': { ...PASS, hash: 'cccc3333', specFingerprint: 'fp-2' } });
  const r = verify(p, '/good', { assess: bumped });
  assert.equal(r.ok, false);
  // the hash moves first, so this is caught as a mismatch — still correctly un-authentic
  assert.ok(r.reason === 'hash-mismatch' || r.reason === 'benchmark-version-changed');
});

test('the gate partitions listings by whether their repo passes', () => {
  const listings = [
    { name: 'alpha', repo: '/good' },
    { name: 'beta', repo: '/bad' },
    { name: 'gamma', repo: '/missing' },
  ];
  const r = filterListings(listings, { assess, resolveRepo: (l) => l.repo });
  assert.equal(r.total, 3);
  assert.equal(r.admitted.length, 1);
  assert.equal(r.admitted[0].listing.name, 'alpha');
  assert.equal(r.rejected.length, 2);
  const reasons = r.rejected.map((x) => x.reason).sort();
  assert.deepEqual(reasons, ['failed-benchmark', 'unresolvable']);
});

test('a stricter policy can raise the bar above the badge', () => {
  const strict = (proof) => proof.verdict.badge === true && proof.verdict.nonCore === '14/14';
  assert.equal(proveRepo('/good', { assess, policy: strict }).admissible, true);
  // a passing-but-weaker repo would be held out
  const weakPass = fakeBenchmark({ '/x': { ...PASS, summary: { core: '10/10', nonCore: '11/14' } } });
  assert.equal(proveRepo('/x', { assess: weakPass, policy: strict }).admissible, false);
});

test('proving is deterministic — same repo, same benchmark, same proof (sans timestamp)', () => {
  const a = proveRepo('/good', { assess });
  const b = proveRepo('/good', { assess });
  assert.deepEqual(a, b);
});

test('a malformed proof is rejected, not trusted', () => {
  assert.equal(verify(null, '/good', { assess }).ok, false);
  assert.equal(verify({ admissible: true }, '/good', { assess }).reason, 'malformed-proof');
});
