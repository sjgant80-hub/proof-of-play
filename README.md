# proof-of-play

**▶ Live: https://sjgant80-hub.github.io/proof-of-play/** — try to list something, then try to forge the receipt. The gate on that page is this repo's real `proveRepo`/`verify`, inlined verbatim.

> The empirical filter for a marketplace of AI-built tools. **No listing without a reproducible,
> un-forgeable proof that the tool's repository passes a benchmark.** The anti-lemons gate.

A catalog that admits tools on self-asserted quality is worthless — anyone can claim their tool is
good, so junk and gold list side by side and the price collapses. proof-of-play fixes that with one
rule: **a tool lists only if its repository passes a benchmark, and the pass is a receipt anyone can
reproduce.**

No trusted signer. No authority. No manufactured scarcity. The proof carries the benchmark's own
**content-addressed verdict hash**, and the default benchmark ([acg-assessor](https://github.com/sjgant80-hub/acg-assessor))
is deterministic — so `verify` just re-runs it and checks the hash. You **cannot** claim a pass your
code does not produce.

## Use

```bash
# prove a repo — exits 0 if admissible, 1 if not
node filter.mjs prove ../konomigami-lib

# verify a proof is authentic (re-runs the benchmark, checks the hash)
node filter.mjs prove ../konomigami-lib > k.proof.json
node filter.mjs verify k.proof.json ../konomigami-lib

# the gate: partition a listings.json by whether each repo passes
node filter.mjs filter listings.json --root ..
```

Point it at a different benchmark with `--assessor <path>` or `$PROOF_ASSESSOR`. Any benchmark that
emits `{ badge, hash, spec, specFingerprint, summary }` works — proof-of-play is the gate, the
benchmark is the bar.

## What it guarantees

- **Un-forgeable without a signer** — authenticity rests on a reproducible hash. Paste a passing
  hash onto a failing repo and verification re-derives the real one: mismatch.
- **Non-transferable** — a proof binds to one repository; it won't verify for another.
- **Point-in-time, self-healing** — if a tool degrades, its verdict changes and its proof stops
  verifying, so it falls out of admission on its own.
- **Benchmark-agnostic** — swap the bar without touching the gate.

## Seen on real repositories

Running the gate (with acg-assessor as the benchmark) over a mix of real tools:

```
konomigami-lib   ✅ admit    core 9/9
acg-assessor     ✅ admit    core 10/10
fallkard         ✅ admit    core 10/10
kcc-mint-api     ❌ reject   core 3/8     (a hollow wrapper — correctly blocked)
```

The elite tools are admitted; a stub that only *looks* like a product is rejected. That is the
whole job.

## Test

```bash
npm test   # 10 assertions, incl. the anti-forgery property — a proof of an unearned pass is rejected
```

Zero dependencies · MIT · single-file library + CLI.
