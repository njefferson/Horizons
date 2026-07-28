// A headless walk of the BUILT app (build-plan §4).
//
// The unit tests prove the spine folds correctly in Node. They cannot prove the
// bundle loads, that Dexie opens in a browser, that the gate runs on the write
// path the UI actually uses, or that a captured thought comes back — which is
// the app's one promise. Only driving the real page does that.
//
// It asserts the promise, not the plumbing: type something, and it is still
// there after a full reload, having survived a round trip through IndexedDB.
//
//   node tools/smoke.mjs

import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { CURRENT } from '../src/ui/changelog.ts';

const ROOT = new URL('../public', import.meta.url).pathname;
if (!existsSync(`${ROOT}/app.js`)) {
  console.error('public/app.js is missing — run `npm run build` first.');
  process.exit(1);
}

const launchOpts = { args: ['--no-sandbox'] };
const SANDBOX_CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
if (existsSync(SANDBOX_CHROMIUM)) launchOpts.executablePath = SANDBOX_CHROMIUM;

const failures = [];
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const is = (actual, expected, what) =>
  actual === expected ? ok(`${what}: ${actual}`) : bad(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

const { server, url } = await serve(ROOT);
const browser = await chromium.launch(launchOpts);

try {
  const ctx = await browser.newContext({
    // Not UTC. Headless browsers run in UTC and would pass a test that breaks
    // the moment a real user's evening reads as 3 AM (build-plan §2).
    timezoneId: 'America/Denver',
    locale: 'en-US',
    acceptDownloads: true,
  });
  const page = await ctx.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  // Wait for the APP, not for `load`. The module is still awaiting IndexedDB
  // when `load` fires, so asserting at that moment tests the gap, not the app.
  const ready = () => page.waitForSelector('body[data-ready=true]');

  await page.goto(url, { waitUntil: 'load' });
  await ready();

  console.log('\nFirst run — the panel introduces itself once');
  is(await page.locator('#about').isVisible(), true, 'the (i) panel opens by itself on a fresh store');
  is(await page.locator('#about-intro').isVisible(), true, 'with the first-run introduction');
  is((await page.locator('#version').textContent())?.trim(), CURRENT.triplet,
    'version is the bare triplet — releases do not have names');
  is(await page.locator('.note-triplet').first().textContent(), CURRENT.triplet,
    'patch notes lead with the current release');
  await page.waitForSelector('#storage-body dt');
  const storageRows = await page.locator('#storage-body dt').allTextContents();
  is(storageRows.includes('Keeping your data'), true, 'the storage answer is reported');
  await page.click('#about-close');
  is(await page.evaluate(() => document.activeElement?.id), 'capture',
    'closing the panel hands focus to capture');
  await page.reload({ waitUntil: 'load' });
  await ready();
  is(await page.locator('#about').isVisible(), false, 'and it never opens uninvited again');

  console.log('\nShell');
  is(await page.title(), 'Quietkeep', 'title');
  is(await page.locator('#empty').isVisible(), true, 'empty state shown on a fresh store');
  is(await page.evaluate(() => document.activeElement?.id), 'capture', 'capture has focus on arrival');

  console.log('\nCapture');
  await page.fill('#capture', 'Ring the dentist');
  // The draft is persisted per keystroke; a reload mid-capture must not lose it.
  await page.waitForTimeout(50);
  await page.reload({ waitUntil: 'load' });
  await ready();
  is(await page.inputValue('#capture'), 'Ring the dentist', 'draft survived a reload mid-capture');

  await page.click('#capture-form button[type=submit]');
  await page.waitForSelector('.card');
  is(await page.locator('.card').count(), 1, 'one card after capture');
  is(await page.locator('.card-title').first().textContent(), 'Ring the dentist', 'card text');
  is(await page.inputValue('#capture'), '', 'input cleared after commit');
  is((await page.locator('#status').textContent())?.startsWith('Held'), true, 'confirm reports a write that already landed');

  console.log('\nThe promise');
  await page.reload({ waitUntil: 'load' });
  await ready();
  await page.waitForSelector('.card');
  is(await page.locator('.card-title').first().textContent(), 'Ring the dentist',
    'it came back after a full reload');
  const when = await page.locator('.card-when').first().textContent();
  is(typeof when === 'string' && when.length > 0, true, `every card states its own status in words ("${when}")`);

  console.log('\nLaw 1 — no silent nodes');
  const gauge = await page.locator('#gauge').textContent();
  is(gauge?.includes('0 silent'), true, `gauge reads 0 silent ("${gauge}")`);

  console.log('\nText is text, never interpreted');
  await page.fill('#capture', '<img src=x onerror="globalThis.__pwned=1">');
  await page.click('#capture-form button[type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
  is(await page.evaluate(() => globalThis.__pwned), undefined, 'a hostile capture is stored as text');
  is(await page.locator('.card-title').first().textContent(), '<img src=x onerror="globalThis.__pwned=1">',
    'and shown verbatim');

  console.log('\nExport — the way out');
  await page.click('#open-about');
  is(await page.locator('#about').isVisible(), true, 'the (i) opens on request');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export'),
  ]);
  const fname = download.suggestedFilename();
  is(fname.startsWith('quietkeep-all-') && fname.endsWith('.json'), true,
    `filename says what it is and when ("${fname}")`);
  const parsed = JSON.parse(readFileSync(await download.path(), 'utf8'));
  is(parsed.format, 'planner-log', 'export format field intact');
  const lineKinds = parsed.logJsonl.split('\n').filter(Boolean).map((l) => JSON.parse(l).kind);
  is(lineKinds.includes('capture.recorded'), true, 'the file carries the captured thought');
  is(lineKinds.includes('export.written'), true, 'and its own export.written record — the log explains everything');
  await page.click('#about-close');
  is(await page.locator('#about').isVisible(), false, 'dialog closes');

  console.log('\nAccessibility basics');
  const targets = await page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, input, a')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 44) small.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return small;
  });
  is(targets.length, 0, `every visible target is at least 44px tall${targets.length ? ` — ${targets.join(', ')}` : ''}`);

  console.log('\nNo page errors');
  is(pageErrors.length, 0, pageErrors.length ? `console/page errors: ${pageErrors.join(' | ')}` : 'none');

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('The built app walks. Capture lands, and it comes back.');
