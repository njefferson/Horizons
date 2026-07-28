// The app's accessibility gate — computed, never eyeballed (B-08).
//
// brand.mjs checks the TOKENS. This checks the RENDERED APP: what a person is
// actually shown, in both themes, at the reference sizes, including the states
// a token table cannot see (the first-run dialog, a list with cards in it).
//
// Method, following the hub's a11y-gate:
//  - a REGISTRY of selectors per state. A selector that stops matching FAILS —
//    a check that silently skips what it cannot find is how gates rot.
//  - contrast computed from getComputedStyle against the resolved ancestor
//    background. Thresholds are WCAG: 4.5:1, or 3:1 for large text.
//  - axe-core (pinned 4.10.2 — same pair as the hub) run per state; any
//    violation fails. `incomplete` is printed, never trusted as a pass: audits
//    silently downgrade transformed content to incomplete (B-08).
//  - B-04's hardest viewport: 320px wide at 200% text. Nothing may overflow
//    the page horizontally, and capture must still be a full-size target.
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

// What must be readable, per state. Text-bearing selectors only.
const REGISTRY = {
  'first-run dialog': [
    '#about-title', '.version', '#about-intro p', '.intro-aside',
    '.about-section', '#storage-body dt', '#storage-body dd',
    '#export', '#about-close', '#storage-note', '.note-triplet', '.note-kind',
    '.note-list li', '.about-p', '.about-p a',
  ],
  'empty store': [
    '.wordmark', '#capture', '#capture-form button[type=submit]',
    'button.info', '.section', '.gauge', '.empty', '.foot', '.foot a',
  ],
  'with cards': [
    '.card-title', '.card-when', '#status',
  ],
};

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Runs in the page: resolve each selector's fg colour, effective bg, size and
 *  weight. Background = nearest ancestor with a non-transparent background. */
function sampler(selectors) {
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
  return selectors.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    return {
      sel,
      missing: false,
      fg: fg ? fg.rgb : null,
      bg: bgOf(el),
      size: parseFloat(cs.fontSize),
      weight: parseInt(cs.fontWeight, 10) || 400,
      visible: el.getClientRects().length > 0,
    };
  });
}

async function auditContrast(page, stateName, theme) {
  const rows = await page.evaluate(sampler, REGISTRY[stateName]);
  for (const r of rows) {
    if (r.missing) { fail(`${theme}/${stateName}: registry selector "${r.sel}" matches nothing — the gate no longer sees it`); continue; }
    if (!r.visible) { fail(`${theme}/${stateName}: "${r.sel}" is in the registry but not visible in this state`); continue; }
    if (!r.fg || !r.bg) { fail(`${theme}/${stateName}: could not resolve colours for "${r.sel}"`); continue; }
    const large = r.size >= 24 || (r.size >= 18.66 && r.weight >= 600);
    const need = large ? 3 : 4.5;
    const got = ratio(r.fg, r.bg);
    (got >= need ? pass : fail)(
      `${theme.padEnd(5)} ${stateName.padEnd(16)} ${r.sel.padEnd(36)} ${got.toFixed(2)}:1 (needs ${need}:1)`,
    );
  }
}

async function auditAxe(page, stateName, theme) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() =>
    axe.run(document, { resultTypes: ['violations', 'incomplete'] }));
  if (res.violations.length === 0) {
    pass(`${theme}/${stateName}: axe — 0 violations (${res.incomplete.length} incomplete, reported not trusted)`);
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
      if (r.height < 44) out.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  (small.length === 0 ? pass : fail)(
    `${theme}/${stateName}: targets ≥44px${small.length ? ` — ${small.join(', ')}` : ''}`,
  );
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
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready=true]');

    // State 1: the first-run dialog, exactly as a new user meets it.
    await page.waitForSelector('#storage-body dt');
    await auditContrast(page, 'first-run dialog', theme);
    await auditAxe(page, 'first-run dialog', theme);
    await page.click('#about-close');

    // State 2: the empty store.
    await auditContrast(page, 'empty store', theme);
    await auditAxe(page, 'empty store', theme);
    await auditTargets(page, 'empty store', theme);

    // State 3: with a card on the surface.
    await page.fill('#capture', 'a held thought');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('.card');
    await auditContrast(page, 'with cards', theme);
    await auditAxe(page, 'with cards', theme);

    // B-04's hardest case: 320px wide at 200% text. The page must not scroll
    // sideways, and capture must still be a real target.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const overflow = await page.evaluate(() =>
      document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
    (overflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200% text: horizontal overflow ${overflow}px (must be 0)`);
    const cap = await page.evaluate(() => {
      const r = document.querySelector('#capture').getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    });
    (cap.h >= 44 && cap.w >= 100 ? pass : fail)(
      `${theme}/320px @ 200% text: capture is ${cap.w}x${cap.h} — still a usable target`);

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
console.log('The rendered app passes in both themes, including at 320px/200%.');
