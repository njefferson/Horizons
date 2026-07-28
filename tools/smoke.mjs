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

  const bootStart = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await ready();
  const bootMs = Date.now() - bootStart;

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
  // Wait for the SEEN write to PERSIST before reloading — a fast reload races
  // the fire-and-forget write and the intro re-opens, its modal blocking every
  // later click. This exact race failed CI (not locally), which is why the app
  // flags the write's completion and the test waits for it.
  await page.waitForSelector('body[data-intro-dismissed=true]');
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

  const writeStart = Date.now();
  await page.click('#capture-form button[type=submit]');
  await page.waitForSelector('.card');
  const writeMs = Date.now() - writeStart;
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

  console.log('\nURL capture endpoint (/capture?text=)');
  const before = await page.locator('.card').count();
  await page.goto(`${url}?text=${encodeURIComponent('from a hostile <img src=x> link')}`, { waitUntil: 'load' });
  await ready();
  await page.waitForFunction((n) => document.querySelectorAll('.card').length === n, before + 1);
  const urlCard = await page.locator('.card-title').first().textContent();
  is(urlCard, 'from a hostile <img src=x> link', 'url-endpoint captured the text verbatim, unescaped-but-inert');
  is(await page.evaluate(() => globalThis.__pwned), undefined, 'and did not execute it');
  is(new URL(page.url()).search, '', 'the ?text= param is scrubbed from the address bar');
  is((await page.locator('#status').textContent())?.includes('Held from a link'), true,
    'a drive-by capture is visibly confirmed, never silent');

  // Share target: title + text + url compose into one item.
  const beforeShare = await page.locator('.card').count();
  await page.goto(`${url}?title=${encodeURIComponent('A page')}&text=${encodeURIComponent('worth keeping')}&url=${encodeURIComponent('https://example.com')}`, { waitUntil: 'load' });
  await ready();
  await page.waitForFunction((n) => document.querySelectorAll('.card').length === n, beforeShare + 1);
  const shareCard = await page.locator('.card-title').first().textContent();
  is(shareCard?.includes('A page') && shareCard?.includes('worth keeping') && shareCard?.includes('example.com'), true,
    'share target composed title + text + url into one capture');

  // Shortcut: focuses the empty line, captures nothing.
  const beforeShortcut = await page.locator('.card').count();
  await page.goto(`${url}?capture=1`, { waitUntil: 'load' });
  await ready();
  is(await page.evaluate(() => document.activeElement?.id), 'capture', 'the shortcut lands focused on capture');
  is(await page.locator('.card').count(), beforeShortcut, 'and captures nothing by itself');
  is(new URL(page.url()).search, '', 'the shortcut param is scrubbed too');
  const afterDriveBy = await page.locator('.card').count();
  await page.reload({ waitUntil: 'load' });
  await ready();
  is(await page.locator('.card').count(), afterDriveBy, 'a refresh after scrubbing does not re-capture (count unchanged)');
  // Undo removes exactly the one node it created.
  const beforeUndo = await page.locator('.card').count();
  await page.goto(`${url}?text=${encodeURIComponent('undo me')}`, { waitUntil: 'load' });
  await ready();
  await page.waitForFunction((n) => document.querySelectorAll('.card').length === n, beforeUndo + 1);
  await page.click('#status button');
  await page.waitForFunction((n) => document.querySelectorAll('.card').length === n, beforeUndo);
  is(await page.locator('.card').count(), beforeUndo, 'undo trashed exactly the drive-by node');
  // Return to a clean slate for the export section.
  await page.goto(url, { waitUntil: 'load' });
  await ready();

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
  // Deliver-then-record: a file is built BEFORE its own export.written is
  // committed, so the record shows up in the NEXT export — and a failed export
  // can never leave the log claiming a copy left (audit).
  is(lineKinds.includes('export.written'), false, 'a file predates its own record (deliver, then record)');
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export'),
  ]);
  const parsed2 = JSON.parse(readFileSync(await download2.path(), 'utf8'));
  const kinds2 = parsed2.logJsonl.split('\n').filter(Boolean).map((l) => JSON.parse(l).kind);
  is(kinds2.filter((k) => k === 'export.written').length, 1,
    'the next export carries the previous export.written — the log explains everything');
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

  // Build-plan item 9 sets a 2 s COLD budget measured on the iPad. This is the
  // CI PROXY for it — a desktop-class runner passing at 2 s says nothing about
  // the iPad, but a runner FAILING it catches a gross regression (an accidental
  // spinner, a blocking await) before it ever reaches the device. The real
  // number stays a device reading (docs/verifications.md).
  console.log('\nBudgets (CI proxy — the binding number is measured on the iPad)');
  is(bootMs < 2000, true, `cold load to interactive: ${bootMs}ms (proxy bound 2000ms)`);
  is(writeMs < 1000, true, `submit to visible card: ${writeMs}ms (proxy bound 1000ms)`);

  console.log('\nNo page errors');
  is(pageErrors.length, 0, pageErrors.length ? `console/page errors: ${pageErrors.join(' | ')}` : 'none');

  await ctx.close();

  // --- Triage: the heat pass and the six clarify routes (Phase 2) -----------
  // A fresh context so the inbox starts empty and the counts are exact. Capture
  // six items, drain the heat pass, then route all six ways and prove — from the
  // exported log — that each route committed its own terminal event, not merely
  // the gate's generic cure.
  const tctx = await browser.newContext({ timezoneId: 'America/Denver', locale: 'en-US', acceptDownloads: true });
  const tpage = await tctx.newPage();
  const tErrors = [];
  tpage.on('pageerror', (e) => tErrors.push(String(e)));
  tpage.on('console', (m) => { if (m.type() === 'error') tErrors.push(m.text()); });
  await tpage.goto(url, { waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.click('#about-close');                 // dismiss the first-run panel
  await tpage.waitForSelector('body[data-intro-dismissed=true]');

  console.log('\nTriage — capture fills the inbox');
  for (const t of ['do a two-minute thing', 'a real next step', 'someone owes me this',
    'maybe one day', 'keep for reference', 'not a thing after all']) {
    await tpage.fill('#capture', t);
    await tpage.click('#capture-form button[type=submit]');
  }
  await tpage.waitForFunction(() => document.querySelectorAll('.card').length === 6);
  await tpage.waitForSelector('#triage:not([hidden])');
  is((await tpage.locator('#triage-gauge').textContent())?.includes('6 to clarify'), true,
    'the inbox gauge counts every unclarified item');
  is((await tpage.locator('#triage-prompt').textContent()), 'Hot or cold?',
    'the heat pass leads, before clarify');

  console.log('\nTriage — the heat pass drains');
  // Six taps of Hot; the pass is done when the prompt turns to Clarify.
  for (let i = 0; i < 6; i++) {
    await tpage.click('#triage-actions .route');     // "Hot" is the first button
    await tpage.waitForTimeout(20);
  }
  await tpage.waitForFunction(() =>
    document.querySelector('#triage-prompt')?.textContent?.startsWith('Clarify'));
  is((await tpage.locator('#triage-prompt').textContent())?.startsWith('Clarify (hot)'), true,
    'heat recorded, and clarify now shows the item as hot');

  console.log('\nTriage — the six routes, each terminating on its own');
  // The clarify buttons are label+hint; match by their visible label. Route in
  // the capture order the queue presents (oldest first).
  const routeByLabel = async (label) => {
    const before = Number((await tpage.locator('#triage-gauge').textContent() || '').match(/(\d+) to clarify/)?.[1] ?? 'NaN');
    await tpage.locator('#triage-actions .route', { hasText: label }).first().click();
    // Either the gauge drops by one, or the inbox goes clear.
    await tpage.waitForFunction((n) => {
      const g = document.querySelector('#triage-gauge')?.textContent || '';
      return g.includes('Inbox clear') || Number(g.match(/(\d+) to clarify/)?.[1]) === n - 1;
    }, before);
  };

  await routeByLabel('Do now');
  await tpage.waitForSelector('.donow');             // added a microtask after the route commits
  is(await tpage.locator('.donow').isVisible(), true,
    'routing to Do now starts the visible two-minute timer');
  is((await tpage.locator('.donow-label').textContent())?.includes('Two minutes'), true,
    'and the timer says what it is, in words');
  await routeByLabel('Next action');
  await routeByLabel('Waiting for');
  await routeByLabel('Someday');
  await routeByLabel('Reference');
  await routeByLabel('Trash');

  await tpage.waitForSelector('#triage', { state: 'hidden' });
  is((await tpage.locator('#triage-gauge').textContent()), 'Inbox clear.',
    'the inbox clears and the surface hides itself');
  is(await tpage.locator('.card').count(), 5, 'trash removed exactly its own node; the other five remain held');

  console.log('\nTriage — every route left its terminal event in the log');
  await tpage.click('#open-about');
  const [tdl] = await Promise.all([tpage.waitForEvent('download'), tpage.click('#export')]);
  const tlog = JSON.parse(readFileSync(await tdl.path(), 'utf8')).logJsonl
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const kindCount = (k) => tlog.filter((e) => e.kind === k).length;
  is(kindCount('heat.set'), 6, 'six heat.set events — one per item');
  is(kindCount('clarify.routed'), 6, 'six clarify.routed events — one per route');
  is(kindCount('node.trashed'), 1, 'trash committed node.trashed');
  is(tlog.some((e) => e.kind === 'node.kind.changed' && e.payload?.to === 'waiting-for'), true,
    'waiting-for changed the node kind, not just its clock');
  is(kindCount('menu.item.added'), 2, 'someday and reference each landed on the Menu');
  is(tlog.filter((e) => e.kind === 'clock.set').length >= 3, true,
    'do-now, next-action and waiting-for each set a clock');
  await tpage.click('#about-close');
  // The load-bearing invariant on the real write path, read from the app's own
  // projection: after routing every way, nothing the UI touched is silent.
  is((await tpage.locator('#gauge').textContent())?.includes('0 silent'), true,
    'law 1 holds across all six routes — the held gauge reads 0 silent');

  console.log('\nTriage — no page errors');
  is(tErrors.length, 0, tErrors.length ? `console/page errors: ${tErrors.join(' | ')}` : 'none');
  await tctx.close();
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
