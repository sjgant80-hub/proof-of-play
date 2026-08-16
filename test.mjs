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
  assert.deepEqual(verify(p, '/good', { assess }), { ok: true, cause: null, reason: 'authentic' });
});

test('THE anti-forgery property: a proof claiming a pass the repo does not produce is rejected', () => {
  // forge: take the failing repo, paste in the passing repo's hash + flip admissible.
  const forged = { ...proveRepo('/bad', { assess }), hash: 'aaaa1111', admissible: true, verdict: { ...PASS } };
  const r = verify(forged, '/bad', { assess });
  assert.equal(r.ok, false);
  // The forger pasted a passing verdict onto a failing repo, so the RECORDED FIGURES no longer match
  // what the repo produces. That is what moved, and the refusal names it — instead of emitting one
  // word that also covers a benchmark upgrade and an ordinary commit.
  assert.equal(r.reason, 'verdict-changed');
  assert.equal(r.cause, 'repository');
  assert.deepEqual(r.moved, ['badge', 'core', 'nonCore', 'dominantTell']);
  assert.equal(r.claimed, 'aaaa1111');   // what the forger asserted
  assert.equal(r.actual, 'bbbb2222');    // what the repo actually produces
});

test('a proof that lies about NOTHING but its anchor is refused WITHOUT being called a forgery', () => {
  // Everything the proof records still agrees; only the hash fails to reproduce. That is the shape
  // of a fabricated anchor AND the shape of a change too small to move the recorded figures, and
  // re-running cannot separate them. Naming it "forged" accuses on evidence the tool does not have;
  // naming it "drift" excuses on the same absence. It names neither, and still refuses.
  const p = proveRepo('/good', { assess });
  const r = verify({ ...p, hash: 'deadbeef' }, '/good', { assess });
  assert.equal(r.ok, false, 'the distinction is about the explanation, never a way in');
  assert.equal(r.reason, 'anchor-mismatch');
  assert.equal(r.cause, 'unattributed');
  assert.match(r.detail, /cannot tell these apart/);
});

test('a proof cannot be presented for a different repository, identical content or not', () => {
  // The old check was the hash alone, so a transfer was caught only when the two repos differed.
  // Give them the SAME content — a fork, the everyday case in a fork-tree economy — and the hash
  // reproduces, because the verdict is deterministic over content and the content is the same.
  const twin = fakeBenchmark({ '/good': { ...PASS }, '/fork-of-good': { ...PASS } });
  const p = proveRepo('/good', { assess: twin });
  assert.equal(verify(p, '/good', { assess: twin }).ok, true, 'it verifies for its own repo');
  const r = verify(p, '/fork-of-good', { assess: twin });
  assert.equal(r.ok, false, 'a passing repo proof was reused to list a byte-identical fork');
  assert.equal(r.reason, 'repo-mismatch');
  assert.equal(r.cause, 'proof');
  assert.equal(r.claimed, 'good');
  assert.equal(r.actual, 'fork-of-good');
});

test('the repository name can only refuse, never admit', () => {
  // Two unrelated repos can share a basename, so a matching name proves nothing and the hash still
  // has to reproduce. Same name, different content: refused on the verdict, not waved through.
  const twoDirs = fakeBenchmark({ '/a/thing': { ...PASS }, '/b/thing': { ...FAIL } });
  const p = proveRepo('/a/thing', { assess: twoDirs });
  const r = verify(p, '/b/thing', { assess: twoDirs });
  assert.equal(r.ok, false);
  assert.notEqual(r.reason, 'repo-mismatch', 'the names matched, so the name check had nothing to say');
  assert.equal(r.cause, 'repository');
});

test('a proof does not transfer between repos', () => {
  const goodProof = proveRepo('/good', { assess });
  const r = verify(goodProof, '/bad', { assess });   // present a good proof for the bad repo
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'repo-mismatch');
});

test('a stale proof under a changed benchmark blames the benchmark, not the repository', () => {
  const p = proveRepo('/good', { assess });
  // the benchmark bumps: same badge, a different fingerprint AND a different verdict hash — which
  // is what a real benchmark does, since acg-assessor hashes a verdict object containing its own
  // spec fingerprint. That is precisely why the old ordering could never reach this branch.
  const bumped = fakeBenchmark({ '/good': { ...PASS, hash: 'cccc3333', specFingerprint: 'fp-2' } });
  const r = verify(p, '/good', { assess: bumped });
  assert.equal(r.ok, false);
  // This assertion used to accept EITHER reason, which is how an unresolved ambiguity gets written
  // down as though it were a decision. The seller is owed one answer, and it is this one.
  assert.equal(r.reason, 'benchmark-changed');
  assert.equal(r.cause, 'benchmark');
  assert.equal(r.claimed, 'fp-1');
  assert.equal(r.actual, 'fp-2');
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
