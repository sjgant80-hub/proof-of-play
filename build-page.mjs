// mkpage.mjs — give proof-of-play and konomify pages that RUN their kernels.
//
// ⚑ Both kernels take their dependencies INJECTED (assess / prove / verify / forge), which is exactly
// what makes them runnable in a browser: the decision logic is the real thing, and only the I/O it
// would have reached for is stubbed. The page says so rather than implying it ran a benchmark.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ⚑ THIS WAS AN ABSOLUTE PATH INTO ONE MACHINE'S SCRATCH DIRECTORY. The script ships in the repo and
// claims to generate the repo's page, and it read and wrote somewhere else entirely — so running it
// in a clone regenerated a stale copy that happened to exist beside it and left index.html untouched,
// while on any other machine it would fail outright. The page that a visitor exercises is supposed to
// BE the gated kernel; a generator that cannot be pointed at its own repository is not evidence of
// that, and nothing checked. Paths are resolved from this file now, and CI regenerates and diffs.
const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');

// The konomify page is built from its own repository, cloned or checked out beside this one. It is
// skipped with a message when it is not there rather than taking the whole build down — but it is
// never silently skipped, because a build step that quietly does nothing reads exactly like one that
// worked.
const SIBLING = (name) => join(HERE, '..', name);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Write the page — or, under --check, refuse when what is committed is not what the kernel produces.
// A page that claims to run the gated kernel and quietly stopped doing so is the exact failure this
// generator exists to prevent, and it is invisible until somebody reads the file.
function emit(target, html, label) {
  if (CHECK) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === html) { console.log(`${label}/index.html is up to date with the kernel`); return; }
    console.error(current === null
      ? `${label}/index.html is missing — run: node build-page.mjs`
      : `${label}/index.html has DRIFTED from the kernel it claims to run — run: node build-page.mjs`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(target, html);
}

// Node imports the kernels reach for but which the demo never triggers, because every call path the
// page exercises has its dependency injected. Shimmed to throw, so a path that DID reach I/O is loud.
const SHIM = `
// ── browser shims. Every one throws: the demo injects its dependencies, so if one of these is ever
// reached it means the page took an I/O path and should fail loudly rather than fake a result.
const spawnSync = () => { throw new Error('spawnSync is not available in the browser — this demo injects its assessor'); };
const readFileSync = () => { throw new Error('readFileSync is not available in the browser'); };
const basename = (p) => String(p).split(/[\\\\/]/).filter(Boolean).pop() || String(p);
// process is shimmed INERT rather than removed, so the kernel's own bottom-of-file guard
// (\`if (process.argv[1] && ...) cli(process.argv)\`) evaluates argv[1] as undefined and declines to
// start the command line — which is exactly what that guard is for. env is empty so the default
// assessor path resolves to the literal fallback; the page never calls it, it injects its own.
const process = { argv: [], env: {}, execPath: 'node',
  exit: (c) => { throw new Error('process.exit(' + c + ') is not available in the browser'); } };
`;

// NB the \r? is load-bearing: these files are CRLF, and `.` in a JS regex stops at \r because \r is a
// line terminator. Without it the hashbang survives into line 8 of the page, where it is a hard
// SyntaxError — a hashbang is only legal at byte 0 of a file.
const strip = (src) => src
  .replace(/^#!.*\r?\n/, '')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export (function|const|class)/gm, '$1')
  .replace(/^export \{[^}]*\};?\s*$/gm, '')
  .replace(/^export default[^\n]*\n/gm, '');

const shell = ({ name, tagline, lede, kernelLines, body, script, claim }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} — ${esc(tagline)}</title>
<meta name="description" content="${esc(lede)}">
<style>
 :root{--bg:#0a0c0f;--panel:#11151b;--line:#232b36;--ink:#dde5ef;--dim:#8d9bad;--faint:#5d6b7d;
   --ok:#3fb27f;--warn:#d9a441;--no:#e05561;--accent:#6ea8fe;
   --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 *{box-sizing:border-box}html,body{margin:0}
 body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55}
 .wrap{max-width:980px;margin:0 auto;padding:0 18px 70px}a{color:var(--accent)}code{font-family:var(--mono);font-size:.92em}
 header{padding:44px 0 24px;border-bottom:1px solid var(--line)}
 h1{font-family:var(--mono);font-size:clamp(23px,4.2vw,34px);margin:0 0 10px;letter-spacing:-.02em}
 h1 .d{color:var(--ok)}
 .lede{color:var(--dim);max-width:62ch;margin:0;font-size:clamp(15px,2.2vw,17.5px)}.lede b{color:var(--ink);font-weight:600}
 .stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
 .stat{font-family:var(--mono);font-size:12px;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:5px 11px;color:var(--dim)}
 .stat b{color:var(--ink)}.stat.ok b{color:var(--ok)}
 h2{font-size:12.5px;font-family:var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:34px 0 13px}
 .panel{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:17px 19px}
 label{display:block;font-size:11.5px;font-family:var(--mono);color:var(--faint);margin:11px 0 4px;letter-spacing:.05em}
 input,select{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:8px 10px;color:var(--ink);font:inherit;font-size:13.5px}
 input:focus,select:focus{outline:2px solid var(--accent);outline-offset:1px}
 .row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1;min-width:150px}
 .out{margin-top:16px;border-top:1px solid var(--line);padding-top:15px;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
 .vb{font-family:var(--mono);font-size:22px;font-weight:700;padding:9px 16px;border-radius:8px;border:1px solid;white-space:nowrap}
 .v-ok{color:var(--ok);border-color:#1e5540;background:#0f2119}
 .v-no{color:var(--no);border-color:#5e2429;background:#210f11}
 .why{flex:1;min-width:230px;font-size:13.5px;color:var(--dim)}.why b{color:var(--ink)}
 .why .mono{font-family:var(--mono);font-size:12px;color:var(--faint);word-break:break-all;margin-top:6px}
 .note{border-left:2px solid var(--line);padding-left:13px;color:var(--dim);font-size:13.5px;margin:14px 0}
 .note.warn{border-left-color:var(--warn)}.note b{color:var(--ink)}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:11px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:15px 17px}
 .card h3{margin:0 0 6px;font-size:14.5px}.card p{margin:0;font-size:13.4px;color:var(--dim)}
 table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line)}
 th{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
 td.k{font-family:var(--mono);color:var(--dim)}
 footer{margin-top:40px;padding-top:19px;border-top:1px solid var(--line);color:var(--faint);font-size:12.5px}
</style></head><body><div class="wrap">
<header>
 <h1>${esc(name)}<span class="d">.</span></h1>
 <p class="lede">${lede}</p>
 <div class="stats">
  <span class="stat ok"><b>${kernelLines}</b> lines of kernel, live on this page</span>
  <span class="stat">decision logic is the real thing</span>
  <span class="stat">works offline</span>
 </div>
</header>
${body}
<footer>
 <p><b>Generated, never typed.</b> The kernel on this page is inlined verbatim from the repo by
 <code>node build-page.mjs</code>. ${claim}</p>
 <p>MIT · part of the Fall estate · <a href="https://github.com/sjgant80-hub/${esc(name)}">source</a> ·
 <a href="https://sjgant80-hub.github.io/fallworld/">fall world</a></p>
</footer>
</div>
<script type="module">
__KERNEL__
${script}
</script></body></html>
`;

// ── proof-of-play ────────────────────────────────────────────────────────────────────────────────
{
  const src = readFileSync(join(HERE, 'filter.mjs'), 'utf8');
  const kernel = SHIM + strip(src);
  const lines = kernel.split('\n').length;

  const body = `
<h2>The lemons problem</h2>
<p class="note">A catalogue that admits tools on <b>self-asserted</b> quality is worthless: anyone can claim
their tool is good, so junk and gold list side by side and the price collapses. The fix is one rule —
<b>a tool lists only if its repository passes a benchmark, and the pass is a receipt anyone can reproduce.</b></p>

<h2>Try to list something</h2>
<div class="panel">
  <div class="row">
    <div>
      <label for="repo">repository</label>
      <input id="repo" value="some-ai-built-tool" spellcheck="false">
    </div>
    <div>
      <label for="badge">what the benchmark ACTUALLY returned</label>
      <select id="badge">
        <option value="true">passed</option>
        <option value="false">failed</option>
      </select>
    </div>
  </div>
  <label for="claim">what the submitter CLAIMS about it</label>
  <input id="claim" value="production-ready, best in class, fully tested" spellcheck="false">
  <div class="out">
    <div id="vb" class="vb v-ok">LISTED</div>
    <div class="why"><span id="why"></span><div class="mono" id="hash"></div></div>
  </div>
</div>
<p class="note"><b>The claim box does nothing.</b> It is there so you can watch it do nothing — the verdict
comes from the benchmark's own content-addressed hash, and a proof whose hash does not reproduce is not a proof.</p>

<h2>Now try to forge one</h2>
<p class="note">Alongside your submission the page hands <code>verify()</code> a <b>forged receipt</b>: a proof
that claims <code>admissible: true</code> and carries the hash a passing repo would have. Set the benchmark to
<b>failed</b> and watch the forgery get caught — not by a signature check, but because re-running the benchmark
produces a different hash than the receipt claims.</p>
<p class="note"><b>And watch what it is willing to say.</b> A receipt can fail to verify for three
unrelated reasons — the marketplace upgraded its benchmark, the seller's code moved on, or the receipt
was fabricated — and this panel used to print <b>FORGED</b> for all three. Change the benchmark version
below to something the receipt was not minted against: nothing about the repository has changed, and the
refusal says so. A gate that calls an honest seller a forger is not usable by honest sellers.</p>
<div class="panel">
  <label>benchmark version the verifier is running
    <select id="bench">
      <option value="fp-1">fp-1 — the version the receipt was minted against</option>
      <option value="fp-2">fp-2 — the marketplace upgraded since</option>
    </select>
  </label>
  <div class="out">
    <div id="fvb" class="vb v-ok">AUTHENTIC</div>
    <div class="why"><span id="fwhy"></span><div class="mono" id="fdetail"></div></div>
  </div>
</div>

<h2>Why it cannot be forged</h2>
<div class="cards">
 <div class="card"><h3>No trusted signer</h3><p>Nobody's signature makes a proof valid. The benchmark is deterministic over the repository, so anyone can re-run it and confirm the hash themselves.</p></div>
 <div class="card"><h3>The receipt carries the verdict</h3><p>A proof holds the benchmark's own content-addressed verdict hash. You cannot assert a pass your code does not produce.</p></div>
 <div class="card"><h3>Re-verified, not remembered</h3><p><code>verify()</code> re-runs the benchmark against the repo. A listing is a live claim, not a badge earned once.</p></div>
 <div class="card"><h3>No manufactured scarcity</h3><p>Passing is not rationed and not curated. Everything that passes lists; everything that does not, does not.</p></div>
</div>

<h2>The honest bound</h2>
<p class="note warn"><b>This page runs the filter's decision logic, not a benchmark.</b> The kernel takes its
assessor injected, so here it is handed a stub and you choose what the benchmark "returned". That is enough to
show what the gate does with an answer — it is not a claim that anything was assessed.</p>`;

  const script = `
const $ = s => document.querySelector(s);
function render(){
  const passed = $('#badge').value === 'true';
  // The real kernel, with the assessor injected — exactly how it is meant to be used.
  // A fingerprint and a summary, because verify() uses both to work out WHO a mismatch belongs to.
  // Without them every refusal collapses to "cannot attribute", which is honest but shows nothing.
  const assess = () => ({
    badge: passed, hash: 'v-' + (passed ? 'a91c3f77' : '00000000'), benchmark: 'acg-assessor',
    spec: 'acg-1', specFingerprint: $('#bench').value,
    summary: { core: passed ? 10 : 4, nonCore: passed ? 96 : 40 }, dominantTell: passed ? null : 'UNOPENED',
  });
  const repo = $('#repo').value || 'unnamed';
  const proof = proveRepo(repo, { assess, provedAt: '2026-08-13' });
  // Read the gate's OWN published field. Re-deriving the verdict in page code is how a page ends up
  // confidently narrating a reason the kernel never gave.
  const listed = proof.admissible === true;
  $('#vb').className = 'vb ' + (listed ? 'v-ok' : 'v-no');
  $('#vb').textContent = listed ? 'LISTED' : 'REFUSED';
  $('#why').innerHTML = listed
    ? 'The benchmark passed, so it lists. The submitter\\'s claim was <b>not read</b>.'
    : 'The benchmark did not pass, so it does not list — whatever the submitter claimed about it.';
  $('#hash').textContent = 'proof.verdict: ' + JSON.stringify(proof.verdict) + '  hash: ' + proof.hash;

  // The forgery: a receipt asserting the pass a passing repo would have earned, handed to the real
  // verify() against the assessor you configured above.
  const forged = { v: proof.v, repo, benchmark: { spec: 'acg-1', fingerprint: 'fp-1' }, hash: 'v-a91c3f77',
                   verdict: { badge: true, core: 10, nonCore: 96, dominantTell: null }, admissible: true };
  const r = verify(forged, repo, { assess });
  $('#fvb').className = 'vb ' + (r.ok ? 'v-ok' : 'v-no');
  // ⚑ This label was a two-way choice between AUTHENTIC and FORGED, and every refusal was narrated
  // as the receipt having claimed a pass the repository does not produce — an accusation, printed
  // for a benchmark upgrade and an ordinary commit alike. The kernel now publishes WHO the
  // mismatch belongs to, and the page
  // reads that field rather than deciding again in page code, which is how a surface ends up
  // confidently narrating a reason the kernel never gave.
  $('#fvb').textContent = r.ok ? 'AUTHENTIC' : (r.cause === 'proof' ? 'REFUSED · THE RECEIPT' : 'REFUSED');
  const BECAUSE = {
    benchmark: 'the verifier and the receipt ran <b>different versions of the benchmark</b>. Nothing here is a claim about the repository — the marketplace\'s own instrument moved. Re-mint against the current version.',
    repository: 'the <b>repository has changed</b> since the receipt was minted: ' + (r.moved || []).join(', ') + ' no longer match. Ordinary, and the remedy is to re-prove — not an accusation.',
    unattributed: 'the anchor does not reproduce while every recorded figure still agrees. That is the shape of a fabricated hash <i>and</i> of a change too small to move those figures, and <b>re-running cannot tell them apart</b> — so it does not pretend to.',
    proof: 'the receipt claims more than its own verdict supports, or was minted for a different repository. This one is about the receipt.',
    input: 'what was handed in is not a proof at all.',
  };
  $('#fwhy').innerHTML = r.ok
    ? 'The receipt reproduces: re-running the benchmark gives the same hash it claims. Nothing here trusted a signature — it re-ran the thing.'
    : 'Refused as <b>' + r.reason + '</b> — ' + (BECAUSE[r.cause] || 'no cause was given.');
  $('#fdetail').textContent = JSON.stringify(r);
}
for (const id of ['repo','badge','claim','bench']) { $('#'+id).addEventListener('input', render); $('#'+id).addEventListener('change', render); }
render();`;

  const html = shell({
    name: 'proof-of-play', tagline: 'the anti-lemons gate',
    lede: "No listing without a <b>reproducible, un-forgeable proof</b> that the tool's repository passes a benchmark. No trusted signer, no authority, no manufactured scarcity.",
    kernelLines: lines, body, script,
    claim: 'The gate you exercise here is the real <code>proveRepo</code> and <code>defaultPolicy</code>.',
  }).replace('__KERNEL__', () => kernel);

  emit(join(HERE, 'index.html'), html, 'proof-of-play');
  console.log(`proof-of-play/index.html — ${lines} kernel lines, ${(html.length / 1024).toFixed(0)}KB`);
}

// ── konomify ─────────────────────────────────────────────────────────────────────────────────────
// Built from its own repository checked out beside this one. Announced when absent rather than
// skipped in silence, because a build step that quietly does nothing reads exactly like one that
// worked — and this script had to be told which repository it was for at all.
if (!existsSync(join(SIBLING('konomify'), 'konomify.mjs'))) {
  console.log('konomify/ is not checked out beside this repo — skipping its page (this repo\'s page is unaffected)');
} else {
  const src = readFileSync(join(SIBLING('konomify'), 'konomify.mjs'), 'utf8');
  const kernel = SHIM + strip(src);
  const lines = kernel.split('\n').length;

  const body = `
<h2>The tract</h2>
<p class="note">konomify adds no new organ. It <b>connects</b> the ones that already exist into one pass:
<b>acg-assessor</b> (the structural gut) → <b>witness</b> (the behavioural gut) → <b>proof-of-play</b> (the
absorption wall) → the mesh graft → a card. Pass and you join the mesh; fail and you go back to the pan.</p>
<p class="note"><b>It does not badge-farm — it digests.</b> <code>elite ≠ correct</code>: a build can be
beautifully structured and still have tests that guard nothing, and that one is rejected too.</p>

<h2>Feed it a build</h2>
<div class="panel">
  <div class="row">
    <div><label for="repo">build</label><input id="repo" value="some-build" spellcheck="false"></div>
    <div><label for="struct">structural gut · acg-assessor</label>
      <select id="struct"><option value="true">admissible</option><option value="false">not admissible</option></select></div>
    <div><label for="mut">behavioural gut · witness</label>
      <select id="mut"><option value="0">every mutant died</option><option value="3">3 mutants SURVIVED</option></select></div>
  </div>
  <div class="out">
    <div id="vb" class="vb v-ok">KONOMIFIED</div>
    <div class="why"><span id="why"></span><div class="mono" id="detail"></div></div>
  </div>
</div>
<p class="note warn"><b>Try "admissible" with surviving mutants.</b> That is the case the whole thing exists
for: structure alone is not enough, and a build whose tests do not actually guard its lines goes back to the pan.</p>

<h2>The honest bound</h2>
<p class="note warn">This page runs the <b>tract's decision logic</b> with each gut injected as a stub, so you
choose what they returned. It does not grade, mutate or graft anything — it shows what konomify does with
those answers, which is the part worth checking. The rejection text below is the kernel's <b>own</b>
<code>undercooked.message</code>, not a sentence this page wrote about it.</p>
<p class="note warn">The <b>card</b> stage is deliberately left unwired here. Minting a fallkard needs the real
forge, and stubbing it would mean printing a seal and a byte count that no forge produced. konomify already
handles a missing forge honestly — it emits the organ and skips the card — so that is the path the page takes.</p>`;

  const script = `
const $ = s => document.querySelector(s);
function render(){
  const admissible = $('#struct').value === 'true';
  const n = Number($('#mut').value);
  const name = $('#repo').value || 'unnamed';

  // The stubs match the stage contract konomify documents above its own signature:
  //   prove(repoPath) -> a Proof-of-Play, whose top-level admissible flag is what GATE 1 reads
  //   verify(repoPath) -> { clean, score, survived: <array>, source, skipped }  — survived is a LIST,
  //     because the kernel reports survived.length; handing it a number would print "?" instead.
  const prove = (p) => ({
    v: 1, repo: p,
    benchmark: { spec: 'acg-assessor', fingerprint: 'fp-3a91c0' },
    verdict: { badge: admissible, core: admissible ? 4 : 41, nonCore: 96,
               dominantTell: admissible ? null : 'SCAFFOLD' },
    hash: admissible ? 'v-7c21ab90' : 'v-00000000',
    admissible,
  });
  const verify = () => ({
    clean: n === 0, score: (40 - n) + '/40',
    survived: Array.from({ length: n }, (_, i) => 'mutant#' + (i + 1)),
    source: 'kernel.mjs',
  });

  let out;
  // forge/renderCard are left out on purpose — see "the honest bound". konomify skips the card.
  try { out = konomify(name, { prove, verify, provedAt: '2026-08-13' }); }
  catch (e) { out = { konomified: false, undercooked: { message: e.message } }; }

  const ok = out.konomified === true;
  $('#vb').className = 'vb ' + (ok ? 'v-ok' : 'v-no');
  $('#vb').textContent = ok ? 'KONOMIFIED' : 'BACK TO THE PAN';
  $('#why').innerHTML = ok
    ? 'Both guts passed, so it grafted to the mesh as ring <b>' + out.organ.ring +
      '</b>. The card step was skipped — no forge is wired here — and konomify records that rather than faking one.'
    : 'The kernel\\'s own verdict: <b>' + (out.undercooked?.message || 'refused') + '</b>';
  $('#detail').textContent = ok
    ? 'organ: ' + JSON.stringify(out.organ)
    : 'undercooked: ' + JSON.stringify(out.undercooked);
}
for (const id of ['repo','struct','mut']) { $('#'+id).addEventListener('input', render); $('#'+id).addEventListener('change', render); }
render();`;

  const html = shell({
    name: 'konomify', tagline: 'the one-command mouth',
    lede: 'Feed it a build; it returns it <b>konomified</b> — graded, proven, grafted and carded — or honestly rejected with a note on what is undercooked.',
    kernelLines: lines, body, script,
    claim: 'The tract you exercise here is the real <code>konomify</code>, with each gut injected.',
  }).replace('__KERNEL__', () => kernel);

  emit(join(SIBLING('konomify'), 'index.html'), html, 'konomify');
  console.log(`konomify/index.html — ${lines} kernel lines, ${(html.length / 1024).toFixed(0)}KB`);
}
