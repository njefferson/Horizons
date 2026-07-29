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
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
  '#export', '#about-close', '#storage-ask',
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
  // Work mode. The "why" lines and the behind-list are the lowest-contrast text
  // on these surfaces, so they are named rather than left to axe alone.
  'next up': ['#nextup-heading', '.nextup-title', '.nextup-why', '.nextup-count',
    '#nextup-done', '#nextup-skip', '#gauge', '.card-done'],
  'coverage open': ['#gauge', '.coverage-title', '.coverage-when'],
  // The detail sheet. The hint and the inline labels are the lowest-contrast
  // text on it, and the number inputs are the smallest targets.
  'detail sheet': ['#detail-title', '.detail-state', '.detail-label', '.detail-inline',
    '.detail-hint', '#detail-name', '#detail-date', '#detail-every', '#detail-rename',
    '#detail-date-set', '#detail-close'],
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
    await auditFocusRings(page, 'detail sheet', theme, ['#detail-date-set', '#detail-close']);
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
    await page.click('#detail-close');

    // State 4: the dialog as every RETURN visit sees it — the state real users
    // live in, which the first gate structurally could not audit.
    await page.click('#open-about');
    await page.waitForSelector('#storage-body dt');
    await auditContrast(page, 'dialog, return visit', theme);
    await auditAxe(page, 'dialog, return visit', theme);
    await auditTargets(page, 'dialog, return visit', theme);
    await auditFocusRings(page, 'dialog, return visit', theme, ['#about-close', '#export']);

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

    const overflow = await page.evaluate(() =>
      document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
    (overflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: page horizontal overflow ${overflow}px (must be ≤1)`);
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
