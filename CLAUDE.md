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
6. **A refusal must say what it is ABOUT, and must not claim more than it can show.** `verify()`
   returns a `cause` alongside its `reason`. A receipt can fail to verify because the marketplace
   upgraded its benchmark, because the seller's code moved on, or because the receipt was fabricated —
   three different events, and one word for all three makes the gate unusable by honest sellers. Do
   not collapse them back. Equally: `anchor-mismatch` must never be renamed to anything meaning
   "forged". It is the shape of a fabricated hash AND of a change too small to move the recorded
   figures, and re-running cannot separate them. **Naming a state the tool cannot distinguish is how
   a gate starts making accusations it cannot support.**
   Every cause still returns `ok:false`. The distinction is about the explanation owed to whoever is
   being refused — it is never a way in, and no `cause` may ever gain an admission path.
7. **A proof is bound to a repository, not only to content.** `verify()` compares `proof.repo` to the
   repository it is handed. The hash alone bound a proof to CONTENT, so a byte-identical fork
   re-derived the same hash and the proof transferred. The name check can only ever REFUSE — two
   unrelated repositories can share a basename — so do not let a matching name shortcut the hash.
8. **No absolute paths.** `build-page.mjs` resolves everything from its own location, and CI runs it
   with `--check`. A generator that only works on one machine cannot be evidence that the live page
   is the gated kernel.

## How to run

```bash
npm test
node filter.mjs prove <repo>
node filter.mjs verify <proof.json> <repo>
```

CI (`.github/workflows/ci.yml`) runs, on every push: `npm test`; the witness mutation gate over
`filter.mjs` (pinned tag, and the verdict is READ — witness exits 0 even when mutants survive); and
`node build-page.mjs --check`, which fails if the shipped page has drifted from the kernel it claims
to run.

The baseline (`witness.filter.baseline.json`) is **empty, and that is deliberate**. It previously held
two exemptions and both were wrong: one argued that no invocation could place a flag at argv index
zero, refuted in one line by the exported parser it named; the other analysed only the case where
neither the flag nor `$PROOF_ASSESSOR` was set. Both mutants were killable. Before adding an
exemption, try to kill the mutant first — an argument that a mutant is equivalent is a claim, and
these two did not survive contact with a test.

## Scope / seam

This is a **general** marketplace quality-gate. Keep it that way: no domain-specific vocabulary, no
private framing, no coupling to any one estate. It should read as a standalone anti-lemons filter
that anyone could point at their own catalog and their own benchmark.
