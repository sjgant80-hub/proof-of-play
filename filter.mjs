#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// proof-of-play · the empirical filter — no listing without a reproducible proof of value
//
// A marketplace of AI-built tools has a lemons problem: anyone can *claim* their tool is good,
// and a catalog that lists on self-asserted quality is worthless. This is the anti-lemons gate.
// A tool may list only if its repository PASSES a benchmark — and the pass is a **Proof-of-Play**:
// a receipt carrying the benchmark's own content-addressed verdict hash.
//
// The proof is un-forgeable by construction, with no trusted signer required. The benchmark is
// deterministic over the repository, so anyone can re-run it and confirm the hash. You cannot
// assert a pass your code does not produce, because the verdict reproduces or it doesn't.
//
// The benchmark is INJECTABLE. The default is acg-assessor (a deterministic, content-addressed
// code-quality rubric), but any benchmark that returns { badge, hash, spec, specFingerprint,
// summary } works. proof-of-play is the gate; the benchmark is the bar.
//
// Zero dependencies — node:child_process, node:crypto, node:fs, node:path.
// ════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export const PROOF_VERSION = '0.1';

// The default benchmark: run acg-assessor as a subprocess and parse its --json verdict.
// Override the path with $PROOF_ASSESSOR or by passing your own `assess` function anywhere below.
export function assessorRunner(assessorPath = process.env.PROOF_ASSESSOR || 'acg-assessor/assessor.mjs') {
  return (repoPath) => {
    const r = spawnSync(process.execPath, [assessorPath, repoPath, '--json'],
      { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (!r.stdout) throw new Error(`benchmark produced no verdict for ${repoPath}: ${(r.stderr || r.error?.message || 'unknown').split('\n')[0]}`);
    let v; try { v = JSON.parse(r.stdout); } catch { throw new Error(`benchmark verdict for ${repoPath} was not JSON`); }
    if (v.hash == null || v.badge == null) throw new Error(`benchmark verdict for ${repoPath} lacks badge/hash`);
    return v;
  };
}

// The default listing policy: a repo is admissible iff it earns the benchmark's badge.
// Swap for a stricter or laxer bar — e.g. require a minimum non-core ratio as well.
export const defaultPolicy = (proof) => proof.verdict.badge === true;

// ── prove ────────────────────────────────────────────────────────────────
// Run the benchmark on a repo and mint a Proof-of-Play. `provedAt` is optional metadata and is
// deliberately NOT part of the trust check — authenticity rests on the reproducible hash alone.
export function proveRepo(repoPath, { assess = assessorRunner(), policy = defaultPolicy, provedAt } = {}) {
  const v = assess(repoPath);
  const proof = {
    v: PROOF_VERSION,
    repo: basename(String(repoPath).replace(/[\\/]+$/, '')),
    benchmark: { spec: v.spec ?? null, fingerprint: v.specFingerprint ?? null },
    verdict: {
      badge: v.badge === true,
      core: v.summary?.core ?? null,
      nonCore: v.summary?.nonCore ?? null,
      dominantTell: v.dominantTell ?? null,
    },
    hash: v.hash,                       // the un-forgeable anchor: the benchmark's verdict hash
  };
  if (provedAt) proof.provedAt = provedAt;
  proof.admissible = policy(proof) === true;
  return proof;
}

// ── verify ───────────────────────────────────────────────────────────────
// Re-run the benchmark and confirm the proof is authentic. A forged proof — one claiming a pass
// the repo does not currently produce — fails here. This is why admission cannot be faked.
export function verify(proof, repoPath, { assess = assessorRunner() } = {}) {
  if (!proof || typeof proof !== 'object' || !proof.hash)
    return { ok: false, reason: 'malformed-proof' };
  let fresh;
  try { fresh = assess(repoPath); } catch (e) { return { ok: false, reason: 'benchmark-error', detail: String(e.message || e) }; }

  if (fresh.hash !== proof.hash)
    return { ok: false, reason: 'hash-mismatch', claimed: proof.hash, actual: fresh.hash };
  if (proof.benchmark?.fingerprint && fresh.specFingerprint && proof.benchmark.fingerprint !== fresh.specFingerprint)
    return { ok: false, reason: 'benchmark-version-changed', claimed: proof.benchmark.fingerprint, actual: fresh.specFingerprint };
  // belt and braces: an admissibility claim must match what the verdict actually supports
  if (proof.admissible === true && fresh.badge !== true)
    return { ok: false, reason: 'admissibility-overclaim' };
  return { ok: true, reason: 'authentic' };
}

// ── filter ───────────────────────────────────────────────────────────────
// The gate. Partition a set of listings by whether their repository passes the benchmark.
// `resolveRepo(listing)` maps a listing to a repo path (default: listing.repoPath or listing.repo).
export function filterListings(listings, {
  assess = assessorRunner(), policy = defaultPolicy,
  resolveRepo = (l) => l.repoPath || l.repo, provedAt,
} = {}) {
  const admitted = [], rejected = [], proofs = [];
  for (const listing of listings) {
    const repoPath = resolveRepo(listing);
    if (!repoPath) { rejected.push({ listing, reason: 'no-repo' }); continue; }
    let proof;
    try { proof = proveRepo(repoPath, { assess, policy, provedAt }); }
    catch (e) { rejected.push({ listing, reason: 'unresolvable', detail: String(e.message || e) }); continue; }
    proofs.push(proof);
    if (proof.admissible) admitted.push({ listing, proof });
    else rejected.push({ listing, proof, reason: 'failed-benchmark' });
  }
  return { admitted, rejected, proofs, total: listings.length };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function cli(argv) {
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const cmd = argv[2];
  const assess = assessorRunner(arg('--assessor', process.env.PROOF_ASSESSOR || 'acg-assessor/assessor.mjs'));

  if (cmd === 'prove') {
    const repo = argv[3];
    if (!repo) { console.error('usage: prove <repo> [--assessor path]'); process.exit(2); }
    const proof = proveRepo(repo, { assess });
    console.log(JSON.stringify(proof, null, 2));
    process.exit(proof.admissible ? 0 : 1);
  }

  if (cmd === 'verify') {
    const proofPath = argv[3], repo = argv[4];
    if (!proofPath || !repo) { console.error('usage: verify <proof.json> <repo> [--assessor path]'); process.exit(2); }
    const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
    const r = verify(proof, repo, { assess });
    console.log(`${r.ok ? '✓ AUTHENTIC' : '✗ ' + r.reason.toUpperCase()}` + (r.actual ? `  claimed ${r.claimed} · actual ${r.actual}` : ''));
    process.exit(r.ok ? 0 : 1);
  }

  if (cmd === 'filter') {
    const listingsPath = argv[3];
    if (!listingsPath) { console.error('usage: filter <listings.json> [--root dir] [--assessor path]'); process.exit(2); }
    const root = arg('--root', '.');
    const raw = JSON.parse(readFileSync(listingsPath, 'utf8'));
    const listings = Array.isArray(raw) ? raw : (raw.listings || []);
    const resolveRepo = (l) => `${root}/${l.repo || l.name}`.replace(/\/+/g, '/');
    const r = filterListings(listings, { assess, resolveRepo });
    console.log(`listings: ${r.total}  ·  admitted: ${r.admitted.length}  ·  rejected: ${r.rejected.length}`);
    for (const x of r.rejected) console.log(`  ✗ ${x.listing.repo || x.listing.name || '?'}  (${x.reason})`);
    process.exit(0);
  }

  console.error('proof-of-play · commands: prove, verify, filter');
  process.exit(2);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) cli(process.argv);
