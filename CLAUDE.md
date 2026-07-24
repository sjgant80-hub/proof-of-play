# CLAUDE.md · proof-of-play

Instructions for any agent working in this repository.

## What this is

The **anti-lemons gate** for a marketplace of AI-built tools. A tool may list only if its
repository passes a benchmark, and the pass is a **Proof-of-Play** — a receipt carrying the
benchmark's content-addressed verdict hash, reproducible by anyone. `filter.mjs` is the library +
CLI; see `SPEC.md` before changing anything.

## Invariants you must preserve

1. **Un-forgeable without a signer.** Authenticity comes from the reproducible hash, never from a
   signature or an authority. Do not add a trust root that could bless a proof the benchmark did not
   produce. If `verify` ever returns `ok:true` for a hash the benchmark does not currently emit,
   that is a critical bug.
2. **The benchmark is injected.** `filter.mjs` must not hard-code assessor internals. It consumes a
   verdict shape (`{ badge, hash, spec, specFingerprint, summary }`) and nothing more. Keep it
   benchmark-agnostic.
3. **Proving is deterministic.** Same repo + same benchmark ⇒ same proof. `provedAt` is optional
   metadata and must stay out of the trust check.
4. **Zero dependencies.** Node standard library only.
5. **The tool passes its own gate.** proof-of-play must remain admissible under acg-assessor — it
   eats its own cooking. A change that reddens `npm test` or drops the assessor badge does not ship.

## How to run

```bash
npm test
node filter.mjs prove <repo>
node filter.mjs verify <proof.json> <repo>
```

CI (`.github/workflows/ci.yml`) runs `npm test` on every push.

## Scope / seam

This is a **general** marketplace quality-gate. Keep it that way: no domain-specific vocabulary, no
private framing, no coupling to any one estate. It should read as a standalone anti-lemons filter
that anyone could point at their own catalog and their own benchmark.
