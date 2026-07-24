# proof-of-play · design specification

> Spec version: **proof-of-play-v0.1** · tracks library `PROOF_VERSION` 0.1.

A marketplace of AI-built tools has a **lemons problem**. Sellers know whether their tool works;
buyers do not. If a catalog admits listings on self-asserted quality, good tools and junk look the
same, price collapses to the junk level, and the good tools leave. The classic fix is a signal the
seller cannot fake. This is that signal, made mechanical.

## The claim

**A tool may be listed only if its repository passes a benchmark — and the pass is a Proof-of-Play
that anyone can reproduce.** No trusted signer, no authority, no scarcity. The proof is a receipt
carrying the benchmark's own content-addressed verdict hash.

## Why it cannot be forged

The default benchmark (acg-assessor) is **deterministic and content-addressed**: the same
repository state yields the same verdict and the same `hash`. So a Proof-of-Play is self-verifying —
`verify()` re-runs the benchmark and confirms the hash matches.

- You **cannot claim a pass your code does not produce**: paste a passing hash onto a failing repo
  and verification re-derives the real (failing) hash — mismatch.
- A proof **does not transfer** between repos: the hash is repo-specific.
- A proof is **point-in-time**: if the repository changes, its verdict changes, and the old proof
  stops verifying. For a marketplace this is a feature — a tool that degrades falls out of admission
  on its own. Anti-lemons that self-heals.

No signature is required for authenticity. A signature would only bind a proof to an *identity*;
it would not make a false proof true. Reproducibility does that.

## Objects

A **Proof-of-Play**:

```json
{
  "v": "0.1",
  "repo": "konomigami-lib",
  "benchmark": { "spec": "assessor-v0.7", "fingerprint": "95996e71…" },
  "verdict": { "badge": true, "core": "9/9", "nonCore": "14/14", "dominantTell": null },
  "hash": "baf9d44ccf4564db617e1ef51a29b857",
  "admissible": true
}
```

`hash` is the benchmark's verdict hash — the trust anchor. `provedAt` may be added as metadata; it
is **excluded from the trust check** so proving stays deterministic.

## API

- `proveRepo(repoPath, { assess, policy, provedAt })` → a Proof-of-Play.
- `verify(proof, repoPath, { assess })` → `{ ok, reason }`. Authentic only if the hash reproduces
  (and the admissibility claim matches the verdict).
- `filterListings(listings, { assess, policy, resolveRepo })` → `{ admitted, rejected, proofs }`.
  The gate: partition listings by whether their repository passes.
- `defaultPolicy` — admissible iff the benchmark badge is earned. Replaceable with any predicate to
  raise or lower the bar.

## The injected benchmark

The benchmark is a parameter, not a hard dependency. `assess(repoPath)` must return
`{ badge, hash, spec, specFingerprint, summary }`. The default `assessorRunner()` shells out to
**acg-assessor** (`$PROOF_ASSESSOR` or `acg-assessor/assessor.mjs`), but any benchmark with those
fields — a test-pass rate, an uptime probe, a domain suite — works. proof-of-play is the **gate**;
the benchmark is the **bar**.

## Invariants

1. **Reproducible.** Same repo + same benchmark ⇒ same proof (timestamp aside).
2. **Un-forgeable without a signer.** Authenticity rests on the reproducible hash, nothing else.
3. **Repo-specific and point-in-time.** A proof binds to one repository at one state.
4. **Benchmark-agnostic.** No knowledge of the benchmark's internals beyond its verdict shape.
5. **Zero dependencies.** Node standard library only.

## Verification

`node --test test.mjs` — 10 assertions against a controllable fake benchmark (so the suite needs no
external repo), including the load-bearing anti-forgery test: a proof claiming an unearned pass is
rejected. CI runs it on every push.
