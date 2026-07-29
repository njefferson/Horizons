// The app's accessibility gate — computed, never eyeballed (B-08).
//
// brand.mjs checks the TOKENS. This checks the RENDERED APP: what a person is
// actually shown, in both themes, in every reachable state including the ones
// the first version never rendered — the everyday (i) dialog, the dialog at the
// stressed viewport, focus rings, the placeholder.
//
// The first version of this gate was handed to an adversarial audit, which
// deleted focus rings, dropped the placeholder to 1.44:1, shrank targets to
// 20px and made borders invisible — and the gate printed 66 ok, 0 FAIL. Every
// mechanism below that looks paranoid exists because that run happened:
//  - registries audit EVERY visible match of a selector (worst case), not the first
//  - pseudo-elements are sampled (::placeholder)
//  - focus rings are focused-and-measured, not assumed
//  - targets check width AND height, in every state including the dialog
//  - axe runs per state AND at the stressed viewport; `incomplete` is printed
//    by rule id, and the registry pass covers the pairs axe drops there
//  - the dialog's own scrollWidth is checked: it is a scroll container, so
//    page-level overflow stays 0 while content escapes sideways inside it
//
//   npm run a11y        (exits non-zero on any failure)

import { chromium } from 'playwright-core';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AXE = join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!existsSync(join(ROOT, 'public', 'app.js'))) {
  console.error('public/app.js is missing — run `npm run build` first.');
  process.exit(1);
}

const launchOpts = { args: ['--no-sandbox'] };
const SANDBOX_CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
if (existsSync(SANDBOX_CHROMIUM)) launchOpts.executablePath = SANDBOX_CHROMIUM;

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

// Entries: 'sel' or {sel, pseudo}. Every VISIBLE match is audited; the worst
// ratio is what gets judged. A selector matching nothing visible FAILS.
const DIALOG_COMMON = [
  '#about-title', '.version', '.about-section',
  '#storage-body dt', '#storage-body dd', '#storage-note',
  '#export', '#about-close', '#storage-ask', '#calendar', '#calendar-note', '.about-caveat',
  // The always-reachable way out. This panel is thousands of pixels tall, so a
  // close button only at the bottom meant scrolling the entire release history
  // to shut it (Noah, on device).
  '#about-dismiss',
  // Bringing a copy back. The label and the picker are always there; the note
  // and the two actions only appear once a file has been read, so they get
  // their own state below rather than being registered here where they would
  // match nothing visible.
  '#import-file', 'label[for="import-file"]',
  '.note-triplet', '.note-kind', '.note-list li', '.about-p', '.about-p a',
];
const REGISTRY = {
  'first-run dialog': [...DIALOG_COMMON, '#about-intro p', '.intro-aside'],
  'dialog, return visit': DIALOG_COMMON,
  'empty store': [
    '.wordmark', '#capture', { sel: '#capture', pseudo: '::placeholder' },
    '#capture-form button[type=submit]',
    'button.info', '.section', '.gauge', '.empty', '.foot', '.foot a',
  ],
  'with cards': ['.card-title', '.card-when', '#status', '.group-head'],
  // The triage surface, in both of its passes. Heat shows Hot/Cold; clarify
  // shows the six routes, each a label over a hint. Every visible pair is
  // audited — the hint is the lowest-contrast text on the surface, so it is
  // named explicitly rather than left to axe alone.
  'heat pass': ['.triage-gauge', '.triage-prompt', '.triage-card', '.route'],
  'clarify': ['.triage-gauge', '.triage-prompt', '.triage-card',
    '.route', '.route-label', '.route-hint'],
  // What a just-routed "Do now" offers. The timer is an offering, not a gate,
  // so this state exists before any stopwatch is running — and it carries the
  // Done the flow previously had no way to express at all.
  'do now offered': ['.donow', '.donow-label', '.donow-done'],
  // Work mode. The "why" lines and the behind-list are the lowest-contrast text
  // on these surfaces, so they are named rather than left to axe alone.
  'next up': ['#nextup-heading', '.nextup-title', '.nextup-why', '.nextup-count',
    '#nextup-done', '#nextup-skip', '#gauge', '.card-done'],
  'coverage open': ['#gauge', '.coverage-title', '.coverage-when'],
  // The detail sheet. The hint and the inline labels are the lowest-contrast
  // text on it, and the number inputs are the smallest targets.
  'detail sheet': ['#detail-title', '.detail-state', '.detail-label', '.detail-inline',
    '.detail-hint', '#detail-name', '#detail-date', '#detail-every', '#detail-rename',
    '#detail-date-set', '#detail-close',
    // The dependency picker. A <select> and a number box are the two smallest
    // targets on the densest surface in the app.
    '#detail-feeds', '#detail-lead', '#detail-feeds-set',
    // Containment (law 4). `#detail-place` is the sheet's answer to "where does
    // this sit" and it is stated as ordinary `--ink`, not a quieter token —
    // structural facts are not asides.
    '#detail-parent', '#detail-parent-set', '#detail-make-project'],
  // The same sheet once something IS inside something. `#detail-place` renders
  // ONLY here, so it lives in its own registry entry rather than in the base
  // sheet — where it matched nothing and the gate said so, which is the check
  // working. It is stated as ordinary `--ink`, not a quieter token: a structural
  // fact is not an aside.
  'detail sheet, inside something': ['#detail-place', '#detail-title', '.detail-label',
    '#detail-parent', '#detail-parent-set', '#detail-close'],
  // Dates that have gone by. This surface must read as calm, so its contrast is
  // carried entirely by the ordinary text tokens — there is no alert colour to
  // check, and that absence is the point (law 3, ADR-0034).
  // Focus. The elapsed line and the interrupt hint are the lowest-contrast text
  // here, and both are load-bearing: one says how long you have been at it, the
  // other says your way back is already saved. Nothing on this surface counts
  // down and nothing goes red — there is no alert token to measure, which is the
  // measurement (law 5, B-01).
  //
  // `.focus-elapsed` is NOT here, and the honest reason is that this gate cannot
  // reach it. The line renders only once a whole minute has passed — `focusWords`
  // returns null below that, because "0 minutes so far" is a number pretending to
  // be information — and a walk that sat for sixty seconds twice over would be
  // paying a minute of CI to measure a pair that IS measured: it is `--ink-soft`
  // on `--surface`, the same pair as `.review-count` and `.replan-count` directly
  // above. That is an ARGUMENT, not a measurement, and it is recorded as one in
  // ACCESSIBILITY.md B-13 — same treatment as `.replan-context`.
  'focus': ['#focus-heading', '.focus-title', '#focus-interrupt',
    { sel: '#focus-interrupt', pseudo: '::placeholder' },
    '#focus-interrupt-form button[type=submit]', '.detail-hint', '#focus-done', '#focus-stop'],
  // The same surface once something has been written down during it.
  'focus, interrupted': ['#focus-held', '.focus-title', '#focus-done', '#focus-stop'],
  // Stopping. The five words are optional, and the sheet has to say so without
  // making the empty answer look like a failure to answer.
  'focus sheet': ['#focus-sheet-title', '.detail-label', '#focus-cue',
    { sel: '#focus-cue', pseudo: '::placeholder' },
    '.detail-hint', '#focus-sheet-stop', '#focus-sheet-cancel'],
  // Review, exceptions only. Its rows are the app telling you something is
  // structurally wrong, so they must be as calm as everything else — same ink
  // tokens, no alert colour to check, and that absence is the point.
  'review': ['#review-heading', '.review-count', '.review-open',
    '.review-title', '.review-why'],
  'replan': ['#replan-heading', '.replan-count', '.replan-open',
    '.replan-card-title', '.replan-card-when'],
  // The sheet. The option hints are the lowest-contrast text in the app after
  // the route hints, and they are load-bearing: they say what each choice does.
  //
  // `.replan-context` is NOT here, and the honest reason is not the one the
  // first version gave. It claimed the omission "keeps this list honest"; in
  // fact that line renders only for a node with a `suspense` clock, and NO
  // surface in the app can write one yet — so it is unreachable in every gate,
  // and its contrast is simply UNMEASURED (audit). Its wording and its guards
  // are covered by unit tests in `test/replan.test.ts`; its rendered contrast is
  // not, and will not be until `suspense.set` has a surface. It uses the same
  // `--ink-soft`-on-`--surface` pair as `.replan-when` directly above it, which
  // IS measured here — an argument, not a measurement, and recorded as such.
  'replan sheet': ['#replan-sheet-title', '.replan-when',
    '#replan-sheet-ask', '.replan-choice', '.replan-choice-label', '.replan-choice-hint',
    '.replan-option-label', '.replan-option-hint', '#replan-new-date',
    '.replan-set', '#replan-close'],
  // The failure state, which no walk ever rendered. An error message is exactly
  // the text that gets forgotten, and it appears at the moment a person is
  // already stuck.
  'replan sheet, refused': ['#replan-sheet-error', '#replan-sheet-title', '.replan-when'],
  // A file has been chosen and described. This is the state that carries the
  // destructive control, so it is the one most worth measuring — and the note
  // above it is the sentence someone reads before replacing everything they
  // have.
  'import, file chosen': ['#import-note', '#import-union', '#import-backup', '#import-go', '#import-explainer'],
};

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Runs in the page. For each entry, sample EVERY visible match, resolving fg
 *  (optionally of a pseudo-element) against the nearest opaque ancestor bg. */
function sampler(entries) {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.99) return c.rgb;
    }
    return null;
  };
  return entries.map((entry) => {
    const sel = typeof entry === 'string' ? entry : entry.sel;
    const pseudo = typeof entry === 'string' ? undefined : entry.pseudo;
    const els = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0);
    if (els.length === 0) return { sel, pseudo, missing: true };
    const samples = els.map((el) => {
      const cs = getComputedStyle(el, pseudo);
      const fg = parse(cs.color);
      return {
        fg: fg ? fg.rgb : null,
        bg: bgOf(el),
        size: parseFloat(cs.fontSize),
        weight: parseInt(cs.fontWeight, 10) || 400,
      };
    });
    return { sel, pseudo, missing: false, samples, count: els.length };
  });
}

async function auditContrast(page, stateName, theme, registryKey = stateName) {
  const rows = await page.evaluate(sampler, REGISTRY[registryKey]);
  for (const r of rows) {
    const label = `${r.sel}${r.pseudo ?? ''}`;
    if (r.missing) { fail(`${theme}/${stateName}: registry entry "${label}" matches nothing visible — the gate no longer sees it`); continue; }
    let worst = null;
    let bad = false;
    for (const smp of r.samples) {
      if (!smp.fg || !smp.bg) { bad = true; fail(`${theme}/${stateName}: could not resolve colours for "${label}"`); break; }
      const large = smp.size >= 24 || (smp.size >= 18.66 && smp.weight >= 600);
      const need = large ? 3 : 4.5;
      const got = ratio(smp.fg, smp.bg);
      if (worst === null || got / need < worst.got / worst.need) worst = { got, need };
    }
    if (bad || worst === null) continue;
    (worst.got >= worst.need ? pass : fail)(
      `${theme.padEnd(5)} ${stateName.padEnd(22)} ${label.padEnd(32)} ${worst.got.toFixed(2)}:1 (needs ${worst.need}:1, ${r.count} node${r.count === 1 ? '' : 's'})`,
    );
  }
}

async function auditAxe(page, stateName, theme) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() =>
    axe.run(document, { resultTypes: ['violations', 'incomplete'] }));
  if (res.violations.length === 0) {
    const inc = res.incomplete.map((i) => i.id).join(', ');
    pass(`${theme}/${stateName}: axe — 0 violations${res.incomplete.length ? ` (incomplete: ${inc}; those pairs are held by the registry pass, not waved through)` : ''}`);
  } else {
    for (const v of res.violations) {
      fail(`${theme}/${stateName}: axe ${v.id} (${v.impact}) — ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}`);
    }
  }
}

async function auditTargets(page, stateName, theme) {
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, input, a, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Height carries B-06's 44px floor; width gets WCAG 2.2 2.5.8's 24px —
      // a 20px-wide sliver passed the first gate (audit).
      if (r.height < 44 || r.width < 24) {
        out.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  (small.length === 0 ? pass : fail)(
    `${theme}/${stateName}: targets ≥44px tall, ≥24px wide${small.length ? ` — ${small.join(', ')}` : ''}`,
  );
}

/** Tab to each control the way a keyboard user does — programmatic focus does
 *  NOT set :focus-visible on buttons, so the first version observed no ring and
 *  passed a build with `outline:none` (audit). Real Tabbing sets the keyboard
 *  modality, so what we measure is what a keyboard user is actually shown. */
async function auditFocusRings(page, stateName, theme, selectors) {
  const remaining = new Set(selectors);
  // Start from a clean slate, then walk forward with Tab.
  await page.evaluate(() => (document.activeElement)?.blur?.());
  for (let i = 0; i < 40 && remaining.size > 0; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sels) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const match = sels.find((s) => el.matches(s));
      if (!match) return null;
      const cs = getComputedStyle(el);
      const parseC = (str) => {
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(Number);
        return (p[3] ?? 1) > 0.99 ? [p[0], p[1], p[2]] : null;
      };
      const bgOf = (node) => {
        for (let n = node; n; n = n.parentElement) {
          const c = parseC(getComputedStyle(n).backgroundColor);
          if (c) return c;
        }
        return null;
      };
      return {
        match,
        visible: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        colour: parseC(cs.outlineColor),
        bg: bgOf(el.parentElement ?? el),
        focusVisible: el.matches(':focus-visible'),
      };
    }, [...remaining]);
    if (!hit) continue;
    remaining.delete(hit.match);
    const srgb2 = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum2 = ([r, g, b]) => 0.2126 * srgb2(r) + 0.7152 * srgb2(g) + 0.0722 * srgb2(b);
    const rat = (a, b) => { const [x, y] = [lum2(a), lum2(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const contrast = hit.colour && hit.bg ? rat(hit.colour, hit.bg) : 0;
    const ok = hit.visible !== 'none' && hit.width >= 2 && contrast >= 3;
    (ok ? pass : fail)(
      `${theme.padEnd(5)} ${stateName.padEnd(22)} focus ring ${hit.match.padEnd(20)} ${hit.visible} ${hit.width}px @ ${contrast.toFixed(2)}:1 (needs solid ≥2px ≥3:1)`,
    );
  }
  for (const sel of remaining) {
    fail(`${theme}/${stateName}: never reached "${sel}" by Tab — not keyboard-focusable?`);
  }
}

const { server, url } = await serve(join(ROOT, 'public'));
const browser = await chromium.launch(launchOpts);

try {
  for (const theme of ['light', 'dark']) {
    console.log(`\n=== ${theme} theme ===`);
    const ctx = await browser.newContext({
      timezoneId: 'America/Denver',
      locale: 'en-US',
      colorScheme: theme,
      reducedMotion: 'reduce',   // B-05: everything must hold with motion off
      viewport: { width: 390, height: 844 },
      // This gate injects axe as a script, which the app's own strict CSP
      // (script-src 'self') correctly refuses — the CSP working is proven by
      // smoke.mjs, which runs UNDER the policy and fails on any violation.
      // Accessibility (contrast, rings, structure) is unaffected by CSP, so this
      // context bypasses it to let the instrument run. Division of labour:
      // smoke owns the CSP; a11y owns accessibility.
      bypassCSP: true,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready=true]');

    // State 1: the first-run dialog, exactly as a new user meets it.
    await page.waitForSelector('#storage-body dt');
    await auditContrast(page, 'first-run dialog', theme);
    await auditAxe(page, 'first-run dialog', theme);
    await auditTargets(page, 'first-run dialog', theme);
    await page.click('#about-close');

    // State 2: the empty store.
    await auditContrast(page, 'empty store', theme);
    await auditAxe(page, 'empty store', theme);
    await auditTargets(page, 'empty store', theme);
    await auditFocusRings(page, 'empty store', theme,
      ['#capture', '#capture-form button[type=submit]', 'button.info', '.skip']);

    // State 3: with a card on the surface.
    await page.fill('#capture', 'a held thought');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('.card');
    await auditContrast(page, 'with cards', theme);
    await auditAxe(page, 'with cards', theme);
    await auditTargets(page, 'with cards', theme);
    // Only .card-open exists here: an unrouted capture belongs to triage and is
    // deliberately given no Done control. The tick-off button is audited in the
    // 'next up' state below, once the item has been routed and can be completed.
    await auditFocusRings(page, 'with cards', theme, ['#cards .card-open']);

    // State 3b: the triage surface. Capturing a card left an unrouted node, so
    // the heat pass is already showing. Audit it, then take the heat tap to
    // reveal the six clarify routes and audit those too.
    await page.waitForSelector('#triage:not([hidden]) .route');
    await auditContrast(page, 'heat pass', theme);
    await auditAxe(page, 'heat pass', theme);
    await auditTargets(page, 'heat pass', theme);
    await auditFocusRings(page, 'heat pass', theme, ['#triage-actions .route']);

    await page.click('#triage-actions .route');   // Hot — advances to clarify
    await page.waitForSelector('#triage-actions .route .route-hint');
    await auditContrast(page, 'clarify', theme);
    await auditAxe(page, 'clarify', theme);
    await auditTargets(page, 'clarify', theme);
    await auditFocusRings(page, 'clarify', theme, ['#triage-actions .route']);

    // State 3c: route it, which both clears the inbox — so focus must return to
    // capture rather than fall to <body> (A-5/F-05) — and gives Work mode
    // something to offer.
    await page.evaluate(() => document.querySelector('#triage-actions .route')?.focus());
    await page.keyboard.press('Enter');           // "Do now"
    await page.waitForSelector('#triage', { state: 'hidden' });
    const afterRoute = await page.evaluate(() => document.activeElement?.id ?? '');
    (afterRoute === 'capture' ? pass : fail)(
      `${theme}/triage: focus returns to capture after the last card is routed (on ${afterRoute || 'BODY'}, not <body>)`);

    // State 3c-ii: the do-now offer. It outlives the triage surface — that was
    // the defect — so it is audited here, with #triage already hidden.
    await page.waitForSelector('.donow-done');
    await auditContrast(page, 'do now offered', theme);
    await auditAxe(page, 'do now offered', theme);
    await auditTargets(page, 'do now offered', theme);
    await auditFocusRings(page, 'do now offered', theme, ['.donow-done']);

    // State 3d: Work mode — Next up, then the coverage list opened.
    await page.waitForSelector('#nextup:not([hidden])');
    await auditContrast(page, 'next up', theme);
    await auditAxe(page, 'next up', theme);
    await auditTargets(page, 'next up', theme);
    await auditFocusRings(page, 'next up', theme, ['#nextup-done', '#nextup-skip', '#gauge', '#cards .card-done']);

    await page.click('#gauge');
    await page.waitForSelector('#coverage:not([hidden])');
    await auditContrast(page, 'coverage open', theme);
    await auditAxe(page, 'coverage open', theme);
    await auditTargets(page, 'coverage open', theme);

    // State 3e: the detail sheet — the surface that makes this a planner.
    await page.click('#cards .card-open');
    await page.waitForSelector('#detail[open]');
    await auditContrast(page, 'detail sheet', theme);
    await auditAxe(page, 'detail sheet', theme);
    await auditTargets(page, 'detail sheet', theme);
    await auditFocusRings(page, 'detail sheet', theme, ['#detail-date-set', '#detail-close', '#detail-feeds']);
    // B-04's hardest case, for the densest surface in the app.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const sheetOverflow = await page.evaluate(() => {
      const d = document.querySelector('#detail');
      return d.scrollWidth - d.clientWidth;
    });
    (sheetOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: detail sheet horizontal overflow ${sheetOverflow}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });

    // State 3f: dates that have gone by. Give the open item a date five days
    // behind, which is the only way to reach this surface — and the sheet that
    // is already open is the app's own way of doing it, so this exercises the
    // real path rather than seeding the store from the outside.
    const pastKey = await page.evaluate(() =>
      new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10));
    await page.fill('#detail-date', pastKey);
    await page.click('#detail-date-set');
    await page.waitForTimeout(200);
    await page.click('#detail-close');
    await page.waitForSelector('#replan:not([hidden])');
    await auditContrast(page, 'replan', theme);
    await auditAxe(page, 'replan', theme);
    await auditTargets(page, 'replan', theme);
    await auditFocusRings(page, 'replan', theme, ['.replan-open']);

    await page.click('.replan-open');
    await page.waitForSelector('#replan-sheet[open]');
    await auditContrast(page, 'replan sheet', theme);
    await auditAxe(page, 'replan sheet', theme);
    await auditTargets(page, 'replan sheet', theme);
    await auditFocusRings(page, 'replan sheet', theme,
      ['.replan-choice', '#replan-new-date', '.replan-set', '#replan-close']);

    // The REFUSED state: press Set with an empty date box. No walk rendered this
    // before, so the one message a person sees at the moment they are already
    // stuck went unmeasured (audit).
    await page.click('.replan-set');
    await page.waitForSelector('#replan-sheet-error:not([hidden])');
    await auditContrast(page, 'replan sheet, refused', theme);
    await auditAxe(page, 'replan sheet, refused', theme);
    // The wordiest surface in the app: five options, each a label over a hint,
    // one of them carrying a date box. If anything overflows sideways at 320px
    // and 200%, it is this.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const replanOverflow = await page.evaluate(() => {
      const d = document.querySelector('#replan-sheet');
      return d.scrollWidth - d.clientWidth;
    });
    (replanOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: replan sheet horizontal overflow ${replanOverflow}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#replan-close');

    // State 3f2: focus. Reached the way a person reaches it — the control on the
    // row — and audited in all three of its states, including the sheet where
    // the optional five words are asked for.
    await page.locator('#cards .card-focus').first().click();
    await page.waitForSelector('#focus:not([hidden])');
    await auditContrast(page, 'focus', theme);
    await auditAxe(page, 'focus', theme);
    await auditTargets(page, 'focus', theme);
    await auditFocusRings(page, 'focus', theme,
      ['#focus-interrupt', '#focus-done', '#focus-stop']);

    await page.fill('#focus-interrupt', 'the phone rang');
    await page.click('#focus-interrupt-form button[type=submit]');
    await page.waitForSelector('#focus-held:not([hidden])');
    await auditContrast(page, 'focus, interrupted', theme);
    await auditAxe(page, 'focus, interrupted', theme);

    await page.click('#focus-stop');
    await page.waitForSelector('#focus-sheet[open]');
    await auditContrast(page, 'focus sheet', theme);
    await auditAxe(page, 'focus sheet', theme);
    await auditTargets(page, 'focus sheet', theme);
    await auditFocusRings(page, 'focus sheet', theme,
      ['#focus-cue', '#focus-sheet-stop', '#focus-sheet-cancel']);
    // B-04's hardest case for a sheet carrying a free-text box.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const focusSheetOverflow = await page.evaluate(() => {
      const d = document.querySelector('#focus-sheet');
      return d.scrollWidth - d.clientWidth;
    });
    (focusSheetOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: focus sheet horizontal overflow ${focusSheetOverflow}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#focus-sheet-cancel');
    await page.click('#focus-stop');
    await page.waitForSelector('#focus-sheet[open]');
    await page.click('#focus-sheet-stop');
    await page.waitForTimeout(350);

    // State 3g: containment and Review (law 4). A container with nothing under
    // it is the app's quietest failure — it reads as an ordinary row everywhere
    // else — so the surface that finally says so must be as calm as the rest of
    // the app. There is no alert colour here to measure, and that absence is the
    // measurement.
    // A SECOND item, because containment needs two things: one to hold, one to
    // be held. The walk had exactly one card, so `.nth(1)` waited thirty seconds
    // for something that was never going to exist.
    await page.fill('#capture', 'a bigger piece of work');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('#triage:not([hidden]) .route');
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#triage-actions .route .route-hint').count() > 0) break;
      await page.click('#triage-actions .route');       // Hot — advances to clarify
      await page.waitForTimeout(120);
    }
    await page.locator('#triage-actions .route', { hasText: 'Next action' }).first().click();
    await page.waitForTimeout(250);

    await page.click('#cards .card-open');
    await page.waitForSelector('#detail[open]');
    await page.click('#detail-make-project');
    await page.waitForTimeout(250);
    await page.click('#detail-close');
    await page.waitForSelector('#review:not([hidden])');
    await auditContrast(page, 'review', theme);
    await auditAxe(page, 'review', theme);
    await auditTargets(page, 'review', theme);
    await auditFocusRings(page, 'review', theme, ['.review-open']);

    // And the sheet once something IS inside something — the only state in which
    // `#detail-place` renders at all. Left out, the one line that states a
    // structural fact would go permanently unmeasured, which is exactly the hole
    // an audit found behind `.replan-context`.
    // The SECOND card. The first is the container just made, and a container's
    // own picker excludes itself — so reusing it audited an empty picker and
    // reported the state as unauditable, which is the guard below working.
    await page.locator('#cards .card-open').nth(1).click();
    await page.waitForSelector('#detail[open]');
    const canParent = await page.locator('#detail-parent option').count();
    if (canParent > 1) {
      await page.selectOption('#detail-parent', { index: 1 });
      await page.click('#detail-parent-set');
      await page.waitForTimeout(250);
      await page.waitForSelector('#detail-place:not([hidden])');
      await auditContrast(page, 'detail sheet, inside something', theme);
      await auditAxe(page, 'detail sheet, inside something', theme);
      await auditTargets(page, 'detail sheet, inside something', theme);
    } else {
      fail(`${theme}: nothing could be put under anything — the containment state went unaudited`);
    }
    await page.click('#detail-close');

    // State 4: the dialog as every RETURN visit sees it — the state real users
    // live in, which the first gate structurally could not audit.
    await page.click('#open-about');
    await page.waitForSelector('#storage-body dt');
    await auditContrast(page, 'dialog, return visit', theme);
    await auditAxe(page, 'dialog, return visit', theme);
    await auditTargets(page, 'dialog, return visit', theme);
    await auditFocusRings(page, 'dialog, return visit', theme, ['#about-close', '#export', '#calendar']);

    // The import surface with a file chosen — the state that carries the
    // destructive control. An empty log is a perfectly valid export (a new user
    // who exports immediately has one), so it is the smallest file that reaches
    // this state honestly, without faking the app's own output.
    // Written OUTSIDE the repo. A fixture inside the tree survives a failed run
    // and can be swept into a commit by a wholesale `git add` — which has
    // happened in this repo once already, and is in the hub's LESSONS.
    const validExport = join(tmpdir(), 'quietkeep-a11y-import-fixture.json');
    writeFileSync(validExport, JSON.stringify({
      format: 'planner-log', version: 1, at: new Date().toISOString(),
      scope: 'all', encrypted: false, logJsonl: '', snapshot: null,
    }));
    await page.setInputFiles('#import-file', validExport);
    await page.waitForSelector('#import-actions:not([hidden])');
    await auditContrast(page, 'import, file chosen', theme);
    await auditAxe(page, 'import, file chosen', theme);
    await auditTargets(page, 'import, file chosen', theme);
    await auditFocusRings(page, 'import, file chosen', theme, ['#import-file', '#import-union', '#import-backup', '#import-go']);
    rmSync(validExport, { force: true });

    // State 5: B-04's hardest case — 320px at 200% text — WITH the dialog
    // open. The dialog is its own scroll container, so page-level overflow
    // stays 0 while content escapes sideways inside it; both get checked.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const dlgOverflow = await page.evaluate(() => {
      const d = document.querySelector('#about');
      return d.scrollWidth - d.clientWidth;
    });
    (dlgOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: dialog horizontal overflow ${dlgOverflow}px (must be ≤1)`);
    await auditContrast(page, 'dialog @ 320/200', theme, 'dialog, return visit');
    await auditAxe(page, 'dialog @ 320/200', theme);
    await page.click('#about-close');

    // NAMES the offender. "42px of overflow" told us the page was broken and
    // nothing about where, so finding it meant writing a throwaway probe by
    // hand — twice. The widest element past the right edge is almost always the
    // cause, and the gate already has the DOM in front of it.
    const over = await page.evaluate(() => {
      const doc = document.scrollingElement;
      const px = doc.scrollWidth - doc.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > doc.clientWidth + 1) {
          out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
            `${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}` +
            ` (right ${Math.round(r.right)}px)`);
        }
      }
      return { px, culprits: out.slice(0, 4) };
    });
    (over.px <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: page horizontal overflow ${over.px}px (must be ≤1)` +
      (over.culprits.length ? ` — past the edge: ${over.culprits.join(', ')}` : ''));
    const cap = await page.evaluate(() => {
      const r = document.querySelector('#capture').getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    });
    (cap.h >= 44 && cap.w >= 100 ? pass : fail)(
      `${theme}/320px @ 200%: capture is ${cap.w}x${cap.h} — still a usable target`);
    await auditAxe(page, 'page @ 320/200', theme);

    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('The rendered app passes: both themes, every state, stressed viewport, rings and placeholder measured.');
