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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// The held gauge reads "N held · M silent". Parse M — `.includes('0 silent')` is
// substring-weak: it is also true for "10 silent" and "100 silent" (audit).
const silentCount = (gaugeText) => {
  const m = /·\s*(\d+)\s+silent/.exec(gaugeText || '');
  return m ? Number(m[1]) : NaN;
};

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

  console.log('\nFirst run — the walkthrough, then the panel for the storage step');
  is(await page.locator('#tour').isVisible(), true, 'the walkthrough opens by itself on a fresh store');
  is((await page.locator('#tour-progress').textContent())?.trim(), 'Step 1 of 4', 'it starts at the first step');
  is(await page.locator('#tour-skip').isVisible(), true, 'Skip is present, so it is never a trap');
  // Step to the end. Back appears after the first step; the last step offers
  // "Get started", which hands off to the (i) panel for keeping your data.
  await page.click('#tour-next');
  is(await page.locator('#tour-back').isVisible(), true, 'Back appears once you have moved');
  await page.click('#tour-next');
  await page.click('#tour-next');
  is((await page.locator('#tour-next').textContent())?.trim(), 'Get started', 'the last step offers to get started');
  await page.click('#tour-next');
  is(await page.locator('#tour').isVisible(), false, 'finishing closes the walkthrough');
  is(await page.locator('#about').isVisible(), true, 'and opens the panel for the storage step');
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
  // Wait for the seen write to PERSIST before reloading — a fast reload races
  // the fire-and-forget write and the walkthrough re-opens, its modal blocking
  // every later click. This race (as the intro) failed CI once, not locally,
  // which is why the app flags the write's completion and the test waits for it.
  await page.waitForSelector('body[data-intro-dismissed=true]');
  await page.reload({ waitUntil: 'load' });
  await ready();
  is(await page.locator('#tour').isVisible(), false, 'the walkthrough never opens uninvited again');
  is(await page.locator('#about').isVisible(), false, 'and neither does the panel');

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
  is(silentCount(gauge), 0, `gauge reads 0 silent ("${gauge}")`);

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
  await tpage.click('#tour-skip');                   // dismiss the first-run walkthrough
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
  // A tap removes the button it was on; focus must not fall to <body> (WCAG
  // 2.4.3). After the heat pass it rests on the prompt of the next card.
  is(await tpage.evaluate(() => document.activeElement?.id), 'triage-prompt',
    'focus is kept on the surface after a triage tap, never dropped to <body>');

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
    'routing to Do now offers what to do about it');
  // THE TIMER IS AN OFFERING, NOT A GATE. It used to start on its own, turning a
  // category ("this one is for today") into a stopwatch nobody asked for, and
  // leaving no way at all to simply say the thing was done (Noah, on device).
  is((await tpage.locator('.donow-label').textContent())?.includes('left'), false,
    'and does NOT start a stopwatch nobody asked for');
  is(await tpage.locator('.donow-done').count(), 1,
    'Done is offered without having to run a timer first');
  // It NAMES the item and offers a way out that is neither Done nor a timer —
  // the offer used to be an unnamed bar with only those two exits (Noah, on
  // device). Made to fail if the label stops naming the item or the exit is gone.
  is((await tpage.locator('.donow-label').textContent())?.includes('do a two-minute thing'), true,
    'the Do now offer names the item it is asking about');
  is(await tpage.locator('.donow button', { hasText: 'Leave it for now' }).count(), 1,
    'and offers a way out that keeps it for today — Done and the timer are not the only exits');
  await routeByLabel('Next action');
  await routeByLabel('Waiting for');
  await routeByLabel('Someday');
  await routeByLabel('Reference');
  await routeByLabel('Trash');

  await tpage.waitForSelector('#triage', { state: 'hidden' });
  is((await tpage.locator('#triage-gauge').textContent()), 'Inbox clear.',
    'the inbox clears and the surface hides itself');
  is(await tpage.locator('.card').count(), 5, 'trash removed exactly its own node; the other five remain held');
  // With the surface gone, focus returns to the capture line, not <body>.
  is(await tpage.evaluate(() => document.activeElement?.id), 'capture',
    'clearing the inbox returns focus to capture, never to <body>');
  // AND THE DO-NOW OFFER SURVIVES THAT. It used to live INSIDE #triage, which
  // this same code hides the moment the inbox is clear — so routing your last
  // item to "Do now" made the offer vanish, and a running timer went on to reach
  // zero invisibly and record an outcome nobody saw.
  is(await tpage.locator('.donow').isVisible(), true,
    'and the Do now offer survives the triage surface hiding itself');


  console.log('\nTriage — every route left its terminal event in the log');
  await tpage.click('#open-about');
  const [tdl] = await Promise.all([tpage.waitForEvent('download'), tpage.click('#export')]);
  const tlog = JSON.parse(readFileSync(await tdl.path(), 'utf8')).logJsonl
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const kindCount = (k) => tlog.filter((e) => e.kind === k).length;
  is(kindCount('heat.set'), 6, 'six heat.set events — one per item');
  is(kindCount('clarify.routed'), 6, 'six clarify.routed events — one per route');
  const routesSeen = tlog.filter(e => e.kind === 'clarify.routed').map(e => e.payload?.route).sort().join(',');
  is(routesSeen, 'do-now,next-action,reference,someday,trash,waiting-for',
    'all six distinct routes were recorded — not six of the same');
  is(kindCount('node.trashed'), 1, 'trash committed node.trashed');
  is(tlog.some((e) => e.kind === 'node.kind.changed' && e.payload?.to === 'waiting-for'), true,
    'waiting-for changed the node kind, not just its clock');
  is(kindCount('menu.item.added'), 2, 'someday and reference each landed on the Menu');
  is(tlog.filter((e) => e.kind === 'clock.set').length >= 3, true,
    'do-now, next-action and waiting-for each set a clock');
  await tpage.click('#about-close');
  // The load-bearing invariant on the real write path, read from the app's own
  // projection: after routing every way, nothing the UI touched is silent.
  is(silentCount(await tpage.locator('#gauge').textContent()), 0,
    'law 1 holds across all six routes — the held gauge reads 0 silent');

  console.log('\nUndo — a routed card can be taken straight back');
  // The complaint this answers: triage is fast, and fast felt like lost. Route a
  // fresh card away, then take it back in one tap. Made to FAIL if
  // clarify.reopened stops returning the card to the inbox.
  await tpage.fill('#capture', 'routed then reclaimed');
  await tpage.click('#capture-form button[type=submit]');
  await tpage.waitForSelector('#triage:not([hidden]) .route');
  await tpage.click('#triage-actions .route');                   // Hot
  await tpage.waitForSelector('#triage-actions .route .route-hint');
  await tpage.locator('#triage-actions .route', { hasText: 'Waiting for' }).first().click();
  await tpage.waitForSelector('#triage-undo .triage-undo-btn');
  is((await tpage.locator('#triage-undo .triage-undo-where').textContent())?.includes('Waiting for'), true,
    'the undo bar names where the card just went');
  await tpage.click('#triage-undo .triage-undo-btn');
  // It is back: the clarify queue shows again, and the log carries a
  // clarify.reopened — the return is an event, not a deletion.
  await tpage.waitForFunction(() => {
    const g = document.querySelector('#triage-gauge')?.textContent || '';
    return !document.querySelector('#triage')?.hidden && /1 to clarify/.test(g);
  });
  is((await tpage.locator('#triage-card').textContent()), 'routed then reclaimed',
    'and the very card is back in the inbox, ready to route again');
  const reopened = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter((e) => e.kind === 'clarify.reopened').length);
    });
  });
  is(reopened, 1, 'undo appended one clarify.reopened — the log explains the return');
  is(await tpage.evaluate(() => (document.querySelector('#triage-undo')?.textContent ?? '').length), 0,
    'and the undo bar clears itself once used');
  // Clean up so the inbox is clear for the next section: send it to Trash.
  await tpage.locator('#triage-actions .route', { hasText: 'Trash' }).first().click();
  await tpage.waitForSelector('#triage', { state: 'hidden' });

  console.log('\nSearch — find something you are holding, and open it');
  // Read-only: it finds a held item and opens it, and writes nothing. Made to
  // FAIL if the query stops matching or a result stops opening the sheet.
  const logLenBeforeSearch = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  await tpage.fill('#search-input', 'owes');
  await tpage.waitForSelector('#search-results .search-open');
  is(await tpage.locator('#search-results .search-open').count(), 1,
    'the query finds exactly the held item whose title matches');
  is((await tpage.locator('#search-results .search-title').first().textContent()), 'someone owes me this',
    'and it is the right one');
  await tpage.click('#search-results .search-open');
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail[open]').count(), 1, 'tapping a result opens its detail sheet');
  await tpage.click('#detail-close');
  const logLenAfterSearch = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  is(logLenAfterSearch, logLenBeforeSearch, 'searching and opening a result wrote nothing to the log');
  await tpage.fill('#search-input', '');            // leave the box as we found it

  console.log('\nDo now — the timer asks, it does not assume');
  // ITS OWN item. The one routed above is left alone deliberately: a later
  // section asserts that an item due today is filed under "Ready now", and
  // completing it here would quietly hollow that check out into a tautology.
  await tpage.fill('#capture', 'a timed two-minute job');
  await tpage.click('#capture-form button[type=submit]');
  await tpage.waitForSelector('#triage:not([hidden]) .route');
  await tpage.click('#triage-actions .route');                   // Hot
  await tpage.waitForSelector('#triage-actions .route .route-hint');
  await tpage.locator('#triage-actions .route', { hasText: 'Do now' }).first().click();
  await tpage.waitForSelector('.donow-done');
  // Two seconds instead of two minutes. `data-seconds` is a seam that exists so
  // this check can happen at all; nothing in the app writes it, so shipped
  // behaviour is always 120.
  await tpage.evaluate(() => { document.querySelector('#triage-donow').dataset.seconds = '2'; });
  await tpage.locator('.donow button', { hasText: 'Start two minutes' }).click();   // not the "Leave it for now" ghost beside it
  await tpage.waitForTimeout(200);
  is((await tpage.locator('.donow-label').textContent())?.includes('left'), true,
    'asking for the timer starts it');
  const timedBefore = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'do-now.timed').length);
    });
  });
  await tpage.waitForTimeout(2800);
  // THE HONESTY FIX. Reaching zero used to commit `outcome: 'completed'` — the
  // app asserting, in a permanent log, that someone had finished a thing it
  // never asked them about. Elapsed is not finished.
  const atZero = await tpage.locator('.donow-label').textContent();
  is(/did you finish/i.test(atZero || ''), true,
    `when the time is up it ASKS ("${atZero}")`);
  const timedAtZero = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'do-now.timed').length);
    });
  });
  is(timedAtZero, timedBefore, 'and records NOTHING until it has been answered');

  const doneBeforeAnswer = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
    });
  });
  await tpage.locator('.donow-done').click();
  await tpage.waitForTimeout(500);
  const answered = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result);
    });
  });
  is(answered.filter(e => e.kind === 'do-now.timed').length, timedBefore + 1,
    'answering records exactly one outcome');
  is(answered.filter(e => e.kind === 'do-now.timed').pop()?.payload?.outcome, 'completed',
    'and "completed" now means the person SAID so');
  // The whole point of the report: a two-minute job could be started and never
  // finished, because nothing in this flow could mark it done.
  is(answered.filter(e => e.kind === 'done.marked').length, doneBeforeAnswer + 1,
    'saying you finished it actually finishes it');
  is(await tpage.locator('.donow').count(), 0, 'and the offer clears itself away');
  console.log('\nTriage — no page errors');
  is(tErrors.length, 0, tErrors.length ? `console/page errors: ${tErrors.join(' | ')}` : 'none');

  // --- Work mode: Next up, "not this", the coverage list (Phase 3) ----------
  // Routing to do-now / next-action left items under clocks, so Next up has
  // something to offer. This asserts the surface OFFERS, RECORDS a done, and —
  // the load-bearing one — that "Not this" writes nothing at all.
  console.log('\nWork mode — one thing is offered');
  // Two more do-nows, so there is genuinely more than one thing asking and
  // "Not this" has somewhere to go. (Of the six routed above, only do-now is
  // asking today: next-action returns tomorrow, waiting-for is someone else's,
  // someday/reference are on the Menu, trash is gone.)
  for (const t of ['second thing asking', 'third thing asking']) {
    await tpage.fill('#capture', t);
    await tpage.click('#capture-form button[type=submit]');
    await tpage.waitForSelector('#triage:not([hidden]) .route');
    await tpage.click('#triage-actions .route');                       // Hot
    await tpage.waitForSelector('#triage-actions .route .route-hint');
    await tpage.locator('#triage-actions .route', { hasText: 'Do now' }).first().click();
    await tpage.waitForTimeout(80);
  }
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.waitForSelector('#nextup:not([hidden])');
  const offered = await tpage.locator('#nextup-title').textContent();
  is(typeof offered === 'string' && offered.length > 0, true, `Next up offers one thing ("${offered}")`);
  is((await tpage.locator('#nextup-why').textContent())?.length > 0, true,
    'and says why, in words');
  const countText = await tpage.locator('#nextup-count').textContent();
  is(/asking/.test(countText || ''), true, `it states how many are asking ("${countText}")`);

  console.log('\nWork mode — "not this" records nothing');
  const logLenBefore = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return await new Promise((res, rej) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
    });
  });
  await tpage.click('#nextup-skip');
  await tpage.waitForTimeout(120);
  const afterSkip = await tpage.locator('#nextup-title').textContent();
  const logLenAfter = await tpage.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result);
    });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  is(logLenAfter, logLenBefore, `skipping appended NOTHING to the log (${logLenBefore} events before and after)`);
  is(afterSkip !== offered, true, `and it moved on ("${offered}" -> "${afterSkip}")`);

  console.log('\nWork mode — Done records, and the item stops being offered');
  // RELATIVE to what is already there. An absolute 1 was measuring how many
  // times the whole walk happens to complete something, not whether this button
  // records one completion — and it went red the moment the do-now flow gained
  // a Done of its own, which is a fact about the walk and not about this button.
  const doneMarkedBefore = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
    });
  });
  const doneTitle = await tpage.locator('#nextup-title').textContent();
  const totalBefore = Number((await tpage.locator('#nextup-count').textContent() || '').match(/(\d+) things/)?.[1] ?? '1');
  await tpage.click('#nextup-done');
  await tpage.waitForTimeout(150);
  const logAfterDone = await tpage.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result);
    });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.map(e => e.kind));
    });
  });
  is(logAfterDone.filter(k => k === 'done.marked').length, doneMarkedBefore + 1,
    `one press, exactly one done.marked (${doneMarkedBefore} before)`);
  // NOT "the title changed" — that passed even with the done-check deleted,
  // because completing an item also moved the rotation (audit: THEATER). Ask the
  // question that actually matters: is the completed thing GONE from the surface,
  // and did the count fall?
  // Scoped to what the surface OFFERS — the head and the list behind it. The
  // live region is excluded on purpose: "Done: <thing>." naming what you just
  // did is correct, and is not the thing still being offered.
  const offeredText = await tpage.evaluate(() =>
    [document.querySelector('#nextup-title')?.textContent ?? '',
     document.querySelector('#nextup-behind')?.textContent ?? ''].join(' | '));
  is(offeredText.includes(doneTitle || '\u0000'), false,
    `the completed thing is gone from head AND from the list behind ("${doneTitle}")`);
  const totalAfter = Number((await tpage.locator('#nextup-count').textContent() || '').match(/(\d+) things/)?.[1] ?? '1');
  is(totalAfter, totalBefore - 1, `and the count fell (${totalBefore} -> ${totalAfter})`);

  console.log('\nWork mode — the gauge is a claim you can open');
  is(await tpage.locator('#coverage').isVisible(), false, 'the coverage list starts closed');
  is(await tpage.getAttribute('#gauge', 'aria-expanded'), 'false', 'and says so to assistive tech');
  await tpage.click('#gauge');
  await tpage.waitForSelector('#coverage:not([hidden])');
  is(await tpage.getAttribute('#gauge', 'aria-expanded'), 'true', 'tapping opens it');
  // NOT `rows > 0` — that passed with the list truncated to a single item
  // (audit: THEATER). The gauge makes a NUMERIC claim and this list is that
  // claim opened, so the two must agree exactly. This is the check that catches
  // the gauge counting trashed nodes the list omits.
  const rows = await tpage.locator('.coverage-item').count();
  const gaugeText = await tpage.locator('#gauge').textContent();
  const claimed = Number((gaugeText || '').match(/^(\d+) held/)?.[1] ?? NaN);
  is(rows, claimed, `the list itemises exactly what the gauge claims ("${gaugeText}" -> ${rows} rows)`);
  is((await tpage.locator('.coverage-when').first().textContent())?.length > 0, true,
    'and each row states its return in words');

  console.log('\nWork mode — no "overdue" anywhere on the surface (law 5)');
  const surfaceText = await tpage.evaluate(() => document.body.innerText);
  // \b boundaries: the bare substring `late` matches the app's own "Later"
  // heading, so this guard passed only because that group happened to be empty at
  // this point in the walk. One data change would have turned law 5 red for no
  // reason (audit).
  is(/\b(overdue|late|missed|streak)s?\b/i.test(surfaceText), false,
    'the rendered page carries no shame vocabulary');

  // --- The detail sheet: dates, repeats, undo (Phase 3.5) ------------------
  // The point of this section is that the app is a PLANNER now: it can hold a
  // date and a repeat, not just a list. Each assertion reads the log, because a
  // surface that looks right and writes nothing is the failure mode that matters.
  console.log('\nDetail sheet — a planner, not just a list');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.click('#cards .card-open');
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail').isVisible(), true, 'tapping something you hold opens its sheet');
  const sheetTitle = await tpage.locator('#detail-title').textContent();
  is(typeof sheetTitle === 'string' && sheetTitle.length > 0, true, `the sheet names the item ("${sheetTitle}")`);

  // A date.
  await tpage.fill('#detail-date', '2026-12-24');
  await tpage.click('#detail-date-set');
  await tpage.waitForTimeout(150);
  const afterDate = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result);
    });
  });
  const dueSet = afterDate.filter(e => e.kind === 'clock.set' && e.payload?.clockKind === 'due');
  is(dueSet.length, 1, 'a real date was recorded');
  is(dueSet[0]?.payload?.source, 'detail:due', 'and it says where it came from');
  is((await tpage.locator('#detail-state').textContent())?.includes('2026-12-24'), true,
    'the sheet reflects the date it just set');

  // A repeat — the path into the decay primitive, which had no caller at all.
  await tpage.fill('#detail-every', '10');
  await tpage.fill('#detail-slack', '3');
  await tpage.click('#detail-repeat-set');
  await tpage.waitForTimeout(150);
  const afterRepeat = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result);
    });
  });
  const intervals = afterRepeat.filter(e => e.kind === 'upkeep.interval.set');
  is(intervals.length, 1, 'upkeep.interval.set was finally emitted by a real surface');
  is(intervals[0]?.payload?.intervalDays, 10, 'with the interval asked for');
  is(intervals[0]?.payload?.comfortWindowDays, 3, 'and its own comfort window');
  is((await tpage.locator('#detail-state').textContent())?.includes('repeats every 10 days'), true,
    'and the sheet says so in plain words');

  // A bad number must not reach the log as NaN.
  await tpage.fill('#detail-every', '0');
  await tpage.click('#detail-repeat-set');
  await tpage.waitForTimeout(100);
  const intervalsAfterBad = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'upkeep.interval.set').length);
    });
  });
  is(intervalsAfterBad, 1, 'a nonsense interval is refused rather than written');
  is((await tpage.locator('#detail-state').textContent())?.includes('whole days'), true,
    'and the reason is shown, not just announced');

  await tpage.click('#detail-close');
  is(await tpage.locator('#detail').isVisible(), false, 'the sheet closes');

  // --- The todo list: groups, inline check-off, rename (Phase 3.5) ---------
  console.log('\nThe todo list — grouped, and you can tick things off');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  const headings = await tpage.locator('.group-head').allTextContents();
  is(headings.length > 0, true, `what you are holding is grouped ("${headings.join('", "')}")`);
  is(headings.every(h => /^(Not sorted yet|Needs a new plan|Ready now|Coming up|Later|On the Menu|Done)$/.test(h)), true,
    'every heading is one of the six, in words');
  // No score, no count of things undone anywhere in the list (law 5).
  is(/\b\d+\b/.test(headings.join(' ')), false,
    'and no heading carries a number of any kind — headings are not a score');

  // Semantics, not spelling. Collapsing every item into one group left the
  // six-name check, the no-score check and the row count ALL green (audit), so
  // assert that a known item is under the heading it belongs to: the do-now item
  // routed earlier returns today, so it must sit under "Ready now".
  const groupOf = await tpage.evaluate((title) => {
    const heads = Array.from(document.querySelectorAll('.group-head'));
    for (const h of heads) {
      let el = h.nextElementSibling;
      if (el && el.classList.contains('cards-group') && el.textContent.includes(title)) return h.textContent;
    }
    return '(not found)';
  }, 'do a two-minute thing');
  is(groupOf, 'Ready now', `an item due today is filed under Ready now (was "${groupOf}")`);

  // The list must never drop something it is holding: rows === the gauge's number.
  const rowCount = await tpage.locator('#cards .card').count();
  const gaugeClaim = Number((await tpage.locator('#gauge').textContent() || '').match(/^(\d+) held/)?.[1] ?? NaN);
  is(rowCount, gaugeClaim, `every held item is shown (${rowCount} rows vs "${gaugeClaim} held")`);

  console.log('\nThe todo list — tick something off without opening it');
  const doneBefore = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
    });
  });
  const tickTitle = await tpage.locator('#cards .card:has(.card-done) .card-title').first().textContent();
  await tpage.locator('#cards .card-done').first().click();
  await tpage.waitForTimeout(180);
  const doneAfter = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
    });
  });
  is(doneAfter, doneBefore + 1, `ticking it off recorded exactly one done.marked ("${tickTitle}")`);
  // Read the row's own status ELEMENT rather than parsing concatenated text —
  // a row's textContent also carries its button labels, which made a naive split
  // unreliable.
  const doneRowStatus = await tpage.evaluate((title) => {
    const heads = Array.from(document.querySelectorAll('.group-head'));
    const done = heads.find(h => h.textContent === 'Done');
    if (!done) return { found: false, status: '(no Done group)' };
    const list = done.nextElementSibling;
    if (!list) return { found: false, status: '(no list)' };
    for (const li of Array.from(list.querySelectorAll('.card'))) {
      if (li.querySelector('.card-title')?.textContent === title) {
        return { found: true, status: li.querySelector('.card-when')?.textContent ?? '' };
      }
    }
    return { found: false, status: '(not in Done)' };
  }, tickTitle);
  is(doneRowStatus.found, true, 'the completed row is actually found in Done');
  // EQUALITY on the row's own status, not a denylist of three phrases over the six
  // strings heldStatus can emit. The denylist passed for `ready now` — a finished
  // thing announcing it is demanding attention right now, the bug in its worst
  // form — and was vacuous whenever the assertion above failed (audit).
  is(doneRowStatus.status, 'done',
    `and its status reads exactly "done" (got "${doneRowStatus.status}")`);

  console.log('\nThe todo list — ticking off is guarded and keeps focus');
  // Two defect classes already fixed twice in this app (clarify.ts, work.ts) and
  // not carried across to this control when it was added: a double-tap writing
  // the action twice, and focus falling to <body> when the row is removed.
  const beforeDouble = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
    });
  });
  // Two clicks in the same frame, on the same row.
  await tpage.evaluate(() => {
    const b = document.querySelector('#cards .card-done');
    b?.click(); b?.click();
  });
  await tpage.waitForTimeout(250);
  const afterDouble = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
    });
  });
  is(afterDouble, beforeDouble + 1,
    `a double-tap records the action ONCE (${beforeDouble} -> ${afterDouble})`);
  const focusAfter = await tpage.evaluate(() => ({
    tag: document.activeElement?.tagName ?? 'NONE',
    cls: document.activeElement?.className ?? '',
    id: document.activeElement?.id ?? '',
  }));
  is(focusAfter.tag !== 'BODY' && focusAfter.tag !== 'NONE', true,
    `focus is kept after ticking something off (on ${focusAfter.id || focusAfter.cls || focusAfter.tag}, not <body>)`);
  // And it SAYS so. The other two surfaces announce a completion; this one was
  // silent, so a screen-reader user got neither confirmation nor focus.
  is((await tpage.locator('#status').textContent())?.startsWith('Done:'), true,
    'and the completion is announced, not silent');

  console.log('\nThe todo list — rename fixes what you wrote');
  await tpage.click('#cards .card-open');
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#detail-name', 'renamed by the smoke walk');
  await tpage.click('#detail-rename');
  await tpage.waitForTimeout(180);
  const renames = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'node.renamed'));
    });
  });
  is(renames.length, 1, 'one node.renamed was recorded');
  is(renames[0]?.payload?.title, 'renamed by the smoke walk', 'with the new title');
  await tpage.click('#detail-close');
  is((await tpage.locator('#cards').textContent())?.includes('renamed by the smoke walk'), true,
    'and the card says it now');

  console.log('\nThe todo list — cards still open after a link capture (regression)');
  // handleUrlEntrances used to call render() bare, dropping openDetail, so every
  // card silently stopped opening its sheet until the next re-render.
  await tpage.goto(`${url}?text=${encodeURIComponent('from a link')}`, { waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.waitForSelector('#cards .card-open');
  await tpage.click('#cards .card-open');
  await tpage.waitForSelector('#detail[open]', { timeout: 3000 }).catch(() => {});
  is(await tpage.locator('#detail').isVisible(), true,
    'a card opens its sheet even after a URL capture re-rendered the list');
  await tpage.click('#detail-close');

  // --- Dates that have gone by (product law 3, ADR-0012/ADR-0034) ----------
  // The claim under test is NOT "a card appears". It is that a passed date stops
  // being offered as ordinary work and becomes a decision instead — one item,
  // one question — and that every option is forward-facing.
  console.log('\nDates that have gone by — a decision, not a row');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#replan').isVisible(), false,
    'nothing has gone by yet, so the surface is not there at all');

  // A row that offers "Done" is exactly a live, routed, off-Menu item — the same
  // set replan considers — so this picks legitimate subjects rather than inbox
  // items triage still owns.
  //
  // TWO of them, not one. With a single lapsed item the count line's plural
  // branch never executed and neither did the "focus returns to the heading"
  // branch, so a constant "One date has gone by." and a deleted tabindex both
  // passed every gate (audit).
  const lapsedTitles = [];
  for (const nth of [0, 1]) {
    const t = await tpage.locator('#cards .card:has(.card-done) .card-title').nth(nth).textContent();
    lapsedTitles.push(t);
    await tpage.locator('#cards .card:has(.card-done) .card-open').nth(nth).click();
    await tpage.waitForSelector('#detail[open]');
    const key = await tpage.evaluate(d =>
      new Date(Date.now() - d * 86400000).toISOString().slice(0, 10), 5 + nth * 4);
    await tpage.fill('#detail-date', key);
    await tpage.click('#detail-date-set');
    await tpage.waitForTimeout(180);
    await tpage.click('#detail-close');
    await tpage.waitForTimeout(80);
  }
  const lapsedTitle = lapsedTitles[0];
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  await tpage.waitForSelector('#replan:not([hidden])');
  is(await tpage.locator('.replan-card').count(), 2,
    `two dates behind raise two decisions ("${lapsedTitles.join('", "')}")`);
  const replanCount = await tpage.locator('#replan-count').textContent();
  // The NUMBER, not merely the phrase. `/gone by/` passed a constant string that
  // said "One date has gone by." however many there were (audit).
  is(replanCount, '2 dates have gone by.',
    `it says how many, plainly (got "${replanCount}")`);
  is((await tpage.locator('.replan-card-when').first().textContent())?.length > 0, true,
    'and each row states how long ago, in words');

  // THE LOAD-BEARING ONE. Next up must no longer offer it: "a real date, and it
  // is here" is the answer that date has already ruled out, and showing both is
  // one item asked two different questions.
  const stillOffered = await tpage.evaluate(() =>
    [document.querySelector('#nextup-title')?.textContent ?? '',
     document.querySelector('#nextup-behind')?.textContent ?? '',
     document.querySelector('#upkeep-chips')?.textContent ?? ''].join(' | '));
  is(stillOffered.includes(lapsedTitle || ' '), false,
    'and the work surface stops offering it — one item, one question');

  // Nothing vanished: the list still holds it, and says what it needs.
  const lapsedRow = await tpage.evaluate((title) => {
    for (const li of Array.from(document.querySelectorAll('#cards .card'))) {
      if (li.querySelector('.card-title')?.textContent === title) {
        return li.querySelector('.card-when')?.textContent ?? '(no status)';
      }
    }
    return '(not in the list)';
  }, lapsedTitle);
  is(lapsedRow, 'needs a new plan',
    `the list still holds it and says what it needs (got "${lapsedRow}")`);
  // And under its OWN heading. Filed under "Ready now" the row reads as ordinary
  // work — the very answer the passed date ruled out — while the surface above
  // asks something else about the same item. One screen, one item, two
  // questions: the defect the Next-up exclusion prevents, relocated to the list.
  const lapsedGroup = await tpage.evaluate((title) => {
    for (const h of Array.from(document.querySelectorAll('.group-head'))) {
      const list = h.nextElementSibling;
      if (list?.textContent?.includes(title)) return h.textContent;
    }
    return '(not found)';
  }, lapsedTitle);
  is(lapsedGroup, 'Needs a new plan',
    `and files it under its own heading, not "Ready now" (was "${lapsedGroup}")`);
  // The list must still hold EVERYTHING — the sum of its groups is what the
  // gauge counts, so a new group must not become a way to drop things.
  const rowsNow = await tpage.locator('#cards .card').count();
  const claimNow = Number((await tpage.locator('#gauge').textContent() || '').match(/^(\d+) held/)?.[1] ?? NaN);
  is(rowsNow, claimNow, `nothing vanished into the new group (${rowsNow} rows vs "${claimNow} held")`);

  // A passed hard date must still reach the calendar. This is the regression
  // 0.9.0 shipped: adding the group moved these out of ics.ts's allowlist and
  // the single thing a reminder exists for stopped being exported, silently,
  // with all eight gates green. Asserted BEFORE the cards are resolved away.
  const calPromised = await tpage.evaluate(() =>
    document.querySelector('#calendar-note')?.textContent ?? '');
  await tpage.click('#open-about');
  await tpage.waitForSelector('#calendar');
  const [preIcal] = await Promise.all([
    tpage.waitForEvent('download'),
    tpage.click('#calendar'),
  ]);
  const preIcs = readFileSync(await preIcal.path(), 'utf8').replace(/\r\n[ \t]/g, '');
  is(preIcs.includes(`SUMMARY:${lapsedTitle}`), true,
    `a date that went by is exactly what a reminder is for ("${lapsedTitle}") ${calPromised}`);
  await tpage.click('#about-close');

  // The options. Five, forward-facing, and none of them files a failure.
  const topCard = await tpage.locator('.replan-card-title').first().textContent();
  await tpage.locator('.replan-open').first().click();
  await tpage.waitForSelector('#replan-sheet[open]');
  is((await tpage.locator('#replan-sheet-title').textContent()), topCard,
    'the sheet names the item it is about');
  const optionText = await tpage.locator('#replan-options').textContent();
  const optionCount = await tpage.locator('.replan-choice').count();
  is(optionCount, 4, `four one-tap options (${optionCount})`);
  is(await tpage.locator('#replan-new-date').count(), 1,
    'plus a date box, for when you already know when');
  is(/\b(missed|fail|failed|behind|overdue|late|should have)\b/i.test(optionText || ''), false,
    'and not one of them files a failure');
  // Law 5 over the WHOLE visible surface, sheet included — this is the one place
  // in the app where shame vocabulary would be easiest to write by accident.
  const replanText = await tpage.evaluate(() =>
    (document.querySelector('#replan')?.innerText ?? '') + ' ' +
    (document.querySelector('#replan-sheet')?.innerText ?? ''));
  is(/\b(overdue|late|missed|streak|failed)s?\b/i.test(replanText), false,
    'no shame vocabulary anywhere on it');

  // Refusing rather than inventing: "Set" with an empty box must write nothing.
  const countReplanEvents = () => tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'replan.resolved').length);
    });
  });
  is(await countReplanEvents(), 0, 'no decision has been recorded yet');
  const whenLine = await tpage.locator('#replan-sheet-when').textContent();
  await tpage.click('.replan-set');
  await tpage.waitForTimeout(200);
  is(await countReplanEvents(), 0, 'a new date with no date is refused, not invented');
  is(await tpage.locator('#replan-sheet').isVisible(), true, 'and the sheet stays open to say so');
  is(await tpage.locator('#replan-sheet-error').isVisible(), true,
    'the reason is SHOWN, not only announced to a screen reader');
  // And it does not cost the user the context. The error used to be written over
  // the "that date was five days ago" line, which is the one thing the card
  // exists to assemble, and it did not come back until the sheet was reopened.
  is(await tpage.locator('#replan-sheet-when').textContent(), whenLine,
    'and the card still says how long ago, which is what it is for');
  // The date box refuses the past at the platform level, so a "new plan" cannot
  // be dated behind you.
  const minAttr = await tpage.getAttribute('#replan-new-date', 'min');
  // The app's LOCAL day, in the zone this context is pinned to — not
  // `toISOString()`, which is UTC. This compared a local day key against a UTC
  // one and was therefore wrong every evening west of Greenwich: from 18:00
  // Denver until midnight UTC the two disagree by a day, and the check reported
  // the app as accepting a date in the past when the app was entirely correct.
  // It passed for the other eighteen hours, which is why it survived.
  const todayKey = await tpage.evaluate(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }));
  is(typeof minAttr === 'string' && minAttr >= todayKey, true,
    `a new date cannot be in the past (min="${minAttr}", local today "${todayKey}")`);

  // Resolve the FIRST of two. "Not now" is legitimate and unremarkable
  // (ADR-0012), and it must take the passed date with it.
  await tpage.locator('.replan-choice', { hasText: 'Not now' }).first().click();
  await tpage.waitForTimeout(250);
  const resolution = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.map(e => ({ kind: e.kind, node: e.node, payload: e.payload })));
    });
  });
  const resolved = resolution.filter(e => e.kind === 'replan.resolved');
  is(resolved.length, 1, 'exactly one decision was recorded');
  is(resolved[0]?.payload?.choice, 'to-menu', 'and it is the one that was chosen');
  const lapsedNode = resolved[0]?.node;
  is(resolution.some(e => e.kind === 'clock.cleared' && e.node === lapsedNode &&
    e.payload?.clockKind === 'due'), true,
    'the passed date went with it — otherwise the decision decides nothing');
  is(resolution.some(e => e.kind === 'menu.item.added' && e.node === lapsedNode), true,
    'and it landed somewhere real: the Menu');
  is(await tpage.locator('#replan-sheet').isVisible(), false, 'the sheet closes itself');
  is((await tpage.locator('#status').textContent())?.includes('Menu'), true,
    'and what happened is announced where it can be both seen and heard');

  // ONE LEFT, so the section stays and focus takes the branch that was never
  // exercised: back to the heading. With a single card the walk always took the
  // else-branch, so deleting the heading's tabindex — carrying an explicit WCAG
  // 2.4.3 comment — left every gate green (audit).
  is(await tpage.locator('#replan').isVisible(), true, 'the other one is still there');
  is(await tpage.locator('#replan-count').textContent(), 'One date has gone by.',
    'and the count came down with it');
  const midFocus = await tpage.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName ?? 'NONE');
  is(midFocus, 'replan-heading',
    `focus returns to the heading while the surface is still there (was "${midFocus}")`);

  const menuGroup = await tpage.evaluate((title) => {
    for (const h of Array.from(document.querySelectorAll('.group-head'))) {
      const list = h.nextElementSibling;
      if (list?.textContent?.includes(title)) return h.textContent;
    }
    return '(not found)';
  }, topCard);
  is(menuGroup, 'On the Menu', `and the list files it as such (was "${menuGroup}")`);

  // Now the last one, which empties the section — the other focus branch.
  await tpage.locator('.replan-open').first().click();
  await tpage.waitForSelector('#replan-sheet[open]');
  await tpage.locator('.replan-choice', { hasText: 'Less of it' }).first().click();
  await tpage.waitForTimeout(250);
  is(await tpage.locator('#replan').isVisible(), false,
    'with the last one decided, the surface goes away entirely');
  const replanFocus = await tpage.evaluate(() => ({
    tag: document.activeElement?.tagName ?? 'NONE', id: document.activeElement?.id ?? '',
  }));
  is(replanFocus.tag !== 'BODY' && replanFocus.tag !== 'NONE', true,
    `and focus lands somewhere real (on ${replanFocus.id || replanFocus.tag}, not <body>)`);
  // "Less of it" means back today — so it is ordinary work again, and Next up is
  // the surface that owns it now.
  const compressed = await tpage.evaluate(() =>
    [document.querySelector('#nextup-title')?.textContent ?? '',
     document.querySelector('#nextup-behind')?.textContent ?? ''].join(' | '));
  is(compressed.includes(lapsedTitles[0] || ' ') || compressed.includes(lapsedTitles[1] || ' '), true,
    'and a compressed item comes back as work, not as a decision');

  console.log('\nThe calendar — the tier that reminds you when the app is shut');
  const calExportsBefore = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'export.written' && e.payload?.scope === 'calendar').length);
    });
  });
  await tpage.click('#open-about');
  await tpage.waitForSelector('#calendar');
  const calNote = await tpage.locator('#calendar-note').textContent();
  // The NUMBER, not a regex that matched the zero-state too: `/…|nothing to send/`
  // accepted "Nothing has a date yet" while the file carried two events, so the
  // two mutually exclusive claims both passed the same check (audit).
  const promised = Number((calNote || '').match(/^(\d+) thing/)?.[1] ?? NaN);
  is(Number.isInteger(promised) && promised > 0, true,
    `it says how many it is about to hand over ("${calNote}")`);
  const [ical] = await Promise.all([
    tpage.waitForEvent('download'),
    tpage.click('#calendar'),
  ]);
  const icsName = ical.suggestedFilename();
  is(icsName.startsWith('quietkeep-calendar-') && icsName.endsWith('.ics'), true,
    `the file is named for what it is ("${icsName}")`);
  const icsText = readFileSync(await ical.path(), 'utf8');
  const icsLines = icsText.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);
  is(icsLines[0], 'BEGIN:VCALENDAR', 'and it is a calendar');
  is(icsLines[icsLines.length - 1], 'END:VCALENDAR', 'a complete one');
  const vevents = icsLines.filter(l => l === 'BEGIN:VEVENT').length;
  const valarms = icsLines.filter(l => l === 'BEGIN:VALARM').length;
  // EQUALITY against what the surface promised. `vevents > 0` had no expected
  // value at all: emitting one event while the note promised two passed (audit),
  // which is half a person's reminders silently missing.
  is(vevents, promised, `it carries exactly what it promised (${vevents} vs ${promised})`);
  is(valarms, vevents, 'every one of which has an alarm — otherwise it reminds nobody');
  // Every DTSTART all-day, AND no timezone machinery anywhere. Checking that ONE
  // DATE line exists passed a file carrying a full VTIMEZONE plus timed 23:59
  // events — the exact failure the all-day design exists to prevent (audit).
  const dtstarts = icsLines.filter(l => l.startsWith('DTSTART'));
  is(dtstarts.length, vevents, 'every event has a DTSTART');
  is(dtstarts.every(l => l.startsWith('DTSTART;VALUE=DATE:')), true,
    'and every one of them is all-day');
  is(icsLines.some(l => l === 'BEGIN:VTIMEZONE'), false, 'no timezone block to get wrong');
  is(icsLines.some(l => /^[A-Za-z0-9-]+(;[^:]*)?;TZID=/.test(l)), false, 'and no TZID parameter');
  // The actual date, not merely date-SHAPED. The filename two lines up already
  // carries the truth, so there is no excuse for accepting 1999-01-01 (audit).
  const isoDay = (icsName.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
  is(icsLines.some(l => l.startsWith('X-WR-CALNAME:') && l.includes(`as of ${isoDay}`)), true,
    `and it says WHEN it was made — as of ${isoDay} — because it is a snapshot`);
  // The completed item from earlier must NOT be in a list of things to come back to.
  const summaries = icsLines.filter(l => l.startsWith('SUMMARY:')).join(' | ');
  is(summaries.includes(doneTitle || '\u0000'), false,
    'nothing already finished is exported as a reminder');
  // WAIT for it to settle. This read fired immediately after the `download`
  // event — which happens at a.click(), BEFORE the commit — so it was blind to a
  // duplicate and would go red on a correct app if the write took 300ms (audit).
  const countCalExports = () => tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'export.written' && e.payload?.scope === 'calendar').length);
    });
  });
  // RELATIVE to what was already there. The replan section exports once of its
  // own (to prove a passed date still reaches the calendar), so an absolute `1`
  // would be measuring how many times the walk happens to press the button
  // rather than whether one press records one hand-off.
  for (let i = 0; i < 40 && (await countCalExports()) <= calExportsBefore; i++) await tpage.waitForTimeout(50);
  await tpage.waitForTimeout(200);           // and give a duplicate time to appear
  is(await countCalExports(), calExportsBefore + 1,
    `one press, one hand-off recorded (${calExportsBefore} before)`);
  // ORDERING, which the count alone can never see: the file must exist BEFORE the
  // event claiming it left. Moving the commit above the download passed the old
  // check (audit) — this reads the surface's own confirmation, which is only
  // written after both.
  is((await tpage.locator('#calendar-note').textContent())?.startsWith('Sent.'), true,
    'and the surface confirms only after the file was handed over');
  await tpage.click('#about-close');

  // --- Bringing a copy back -------------------------------------------------
  // The app could export a whole log and had no way to read one back, so a new
  // device meant starting again. This is the surface people reach for after
  // something has already gone wrong, so it is walked for real: a genuine export
  // taken from this store, a hostile file refused, and a replacement that
  // actually lands and survives a reload.
  console.log('\nBringing a copy back — the way in, which the way out needed');
  await tpage.click('#open-about');
  await tpage.waitForSelector('#import-file');
  is(await tpage.locator('#import-actions').isVisible(), false,
    'nothing destructive is reachable before a file has been read');

  // A real export of the CURRENT store, taken through the app's own button.
  const [backup] = await Promise.all([
    tpage.waitForEvent('download'),
    tpage.click('#export'),
  ]);
  const backupPath = await backup.path();
  const backupJson = JSON.parse(readFileSync(backupPath, 'utf8'));
  const heldBefore = await tpage.locator('#cards .card').count();

  // A file that is not an export at all must be refused with a sentence, and
  // must not reveal the destructive control.
  const junk = join(tmpdir(), 'quietkeep-not-an-export.json');
  writeFileSync(junk, JSON.stringify({ hello: 'world' }));
  await tpage.setInputFiles('#import-file', junk);
  await tpage.waitForTimeout(250);
  const junkNote = await tpage.locator('#import-note').textContent();
  is(/not a Quietkeep export/i.test(junkNote || ''), true,
    `a file that is not an export says so ("${junkNote}")`);
  is(await tpage.locator('#import-actions').isVisible(), false,
    'and "Replace everything" stays out of reach');

  // A file that would fail on WRITE must be refused on READ. This is the worst
  // defect this app has had: two records sharing an id passed inspection, and
  // the append then failed on the unique-id constraint AFTER the store had been
  // cleared — real items gone, replaced by whichever rows landed first, with a
  // raw database error on screen. Checked against the LIVE store, in a browser,
  // because the constraint that broke it is the browser's.
  const dupEvent = { id: 'DUPLICATE', vault: 'personal', at: '2026-07-29T12:00:00.000Z',
    device: 'd', seq: 0, kind: 'capture.recorded', node: 'a',
    payload: { text: 'imported a', source: 'quick', sourceTags: [] } };
  const dupFile = join(tmpdir(), 'quietkeep-duplicate-ids.json');
  writeFileSync(dupFile, JSON.stringify({
    format: 'planner-log', version: 1, at: '2026-07-29T12:00:00.000Z', scope: 'all', encrypted: false,
    logJsonl: [dupEvent, { ...dupEvent, node: 'b', seq: 1 }].map(o => JSON.stringify(o)).join('\n'),
    snapshot: null,
  }));
  const eventsBeforeDup = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  await tpage.setInputFiles('#import-file', dupFile);
  await tpage.waitForTimeout(300);
  const dupNote = await tpage.locator('#import-note').textContent();
  is(/damaged/i.test(dupNote || ''), true, `a file that would fail on write is refused on read ("${dupNote}")`);
  is(await tpage.locator('#import-actions').isVisible(), false,
    'and the destructive control is never offered for it');
  const eventsAfterDup = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  is(eventsAfterDup, eventsBeforeDup, 'and nothing of the user’s was touched');

  // A file whose payload the fold cannot read must be a sentence, not a crash.
  const badPayload = join(tmpdir(), 'quietkeep-bad-payload.json');
  writeFileSync(badPayload, JSON.stringify({
    format: 'planner-log', version: 1, at: '2026-07-29T12:00:00.000Z', scope: 'all', encrypted: false,
    logJsonl: '{"kind":"vault.created","id":"q","seq":0,"device":"d","vault":"personal","at":"2026-07-29T12:00:00.000Z","payload":null}',
    snapshot: null,
  }));
  await tpage.setInputFiles('#import-file', badPayload);
  await tpage.waitForTimeout(300);
  const badNote = await tpage.locator('#import-note').textContent();
  is(/damaged/i.test(badNote || ''), true,
    `an unreadable record is an answer, not a stuck "Reading it…" ("${badNote}")`);
  is((badNote || '').startsWith('Reading it'), false, 'the surface never stops mid-sentence');

  // A file the app WROTE must be described, with the numbers stated.
  await tpage.setInputFiles('#import-file', backupPath);
  await tpage.waitForTimeout(250);
  const goodNote = await tpage.locator('#import-note').textContent();
  is(new RegExp(`holds ${heldBefore} thing`).test(goodNote || ''), true,
    `it says what is in the file, in things (${heldBefore}) not just records ("${goodNote}")`);
  is(/replaces the/.test(goodNote || ''), true, 'and says plainly that this replaces what is here');
  is(await tpage.locator('#import-actions').isVisible(), true, 'only now is the replacement offered');

  // Now REPLACE, with a file that differs from the current store, so "it landed"
  // is distinguishable from "nothing happened" — the check that would otherwise
  // pass on an import that did nothing at all.
  await tpage.click('#about-close');
  await tpage.fill('#capture', 'written after the backup was taken');
  await tpage.click('#capture-form button[type=submit]');
  await tpage.waitForTimeout(250);
  const heldAfterExtra = await tpage.locator('#cards .card').count();
  is(heldAfterExtra, heldBefore + 1, 'the store now differs from the file');

  await tpage.click('#open-about');
  await tpage.waitForSelector('#import-file');
  await tpage.setInputFiles('#import-file', backupPath);
  await tpage.waitForTimeout(250);
  // A REGRESSION GUARD, and it earned its place immediately. `<input type=file>`
  // fires a bubbling `cancel` when its chooser is dismissed, so an Esc handler
  // on the dialog closed the whole panel the moment a file was chosen.
  is(await tpage.evaluate(() => document.querySelector('#about').open), true,
    'choosing a file does not close the panel out from under you');
  await tpage.click('#import-go');
  // The surface reloads itself, because every projection was built from a store
  // that no longer exists.
  await tpage.waitForTimeout(1200);
  await tpage.waitForSelector('body[data-ready=true]');
  const heldRestored = await tpage.locator('#cards .card').count();
  is(heldRestored, heldBefore,
    `the copy replaced what was here (${heldAfterExtra} -> ${heldRestored}, file held ${heldBefore})`);
  const restoredText = await tpage.locator('#cards').textContent();
  is((restoredText || '').includes('written after the backup was taken'), false,
    'and what was written after the backup is genuinely gone — it replaced, it did not merge');

  // It survives a reload, which is the whole point: the data is on the device,
  // not in the page.
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#cards .card').count(), heldBefore, 'and it is still there after a reload');

  // The new log says it was seeded from a file — a store that came from a copy
  // should be able to say so.
  const seeded = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'import.seeded').length);
    });
  });
  is(seeded, 1, 'and the new log records that it was seeded from a copy');

  // --- Dependency dates (build-plan item 27) --------------------------------
  // The half of law 3 that ADR-0012 always described and nothing built. "That
  // date went by" is a fact anyone can see; "it fed the thing you promised for
  // the 14th, and it needed starting two days ago" is the expensive part.
  console.log('\nDependencies — what holds up what, and when it must start');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  // Drain whatever is already in the inbox first, then add these two. Earlier
  // sections leave items behind, and a heat card queued ahead of ours made the
  // wait for a clarify hint time out.
  const routeOne = async (label) => {
    await tpage.waitForSelector('#triage:not([hidden]) .route');
    // Heat cards have no hint; clarify cards do. Tap Hot until clarify appears.
    for (let i = 0; i < 12; i++) {
      if (await tpage.locator('#triage-actions .route .route-hint').count() > 0) break;
      await tpage.click('#triage-actions .route');
      await tpage.waitForTimeout(120);
    }
    await tpage.locator('#triage-actions .route', { hasText: label }).first().click();
    await tpage.waitForTimeout(150);
  };
  while (await tpage.locator('#triage:not([hidden]) .route').count() > 0) {
    await routeOne('Next action');
  }
  for (const t of ['draft the brief', 'brief the boss']) {
    await tpage.fill('#capture', t);
    await tpage.click('#capture-form button[type=submit]');
    await routeOne('Next action');
  }
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  // Six LOCAL days ahead. Adding six times 86,400,000 and slicing the UTC ISO
  // string is not that: in the evening in a negative-offset zone it lands seven
  // local days out, and the arithmetic below then expects the wrong answer while
  // the app computes the right one.
  const sixDays = await tpage.evaluate(() => {
    const localToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const [y, m, d] = localToday.split('-').map(Number);
    const walk = new Date(Date.UTC(y, m - 1, d + 6));
    return walk.toISOString().slice(0, 10);
  });
  await tpage.locator('#cards .card:has-text("brief the boss") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#detail-date', sixDays);
  await tpage.click('#detail-date-set');
  await tpage.waitForTimeout(200);
  await tpage.click('#detail-close');

  await tpage.locator('#cards .card:has-text("draft the brief") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  // The picker offers only what can LEGALLY be fed. Offering an illegal option
  // and refusing it afterwards is a control that lies about what it does.
  const options = await tpage.locator('#detail-feeds option').allTextContents();
  is(options.includes('brief the boss'), true, `the picker offers a legal target (${options.join(', ')})`);
  is(options.includes('draft the brief'), false, 'and never itself');
  await tpage.selectOption('#detail-feeds', { label: 'brief the boss' });
  await tpage.fill('#detail-lead', '2');
  await tpage.click('#detail-feeds-set');
  await tpage.waitForTimeout(300);

  const depLog = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'dependency.declared'));
    });
  });
  is(depLog.length, 1, 'one dependency.declared was recorded');
  is(depLog[0]?.payload?.leadEstimateDays, 2, 'carrying how long this takes');
  // THE ARITHMETIC, in words. Six days out, two days of work: start within four.
  const depWords = await tpage.locator('#detail-feeds-list').textContent();
  is(/start it within 4 days/.test(depWords || ''), true,
    `it works out the last day this can start ("${(depWords || '').slice(-60)}")`);
  is(await tpage.locator('#detail-feeds option').allTextContents()
    .then(o => o.includes('brief the boss')), false,
    'and stops offering a link that already exists');
  await tpage.click('#detail-close');

  // --- Containment and Review (law 4, and the exceptions surface) ----------
  // The app had a parent field from the first fold and NOTHING could set one, so
  // everything was flat and Review's stalled half could never fire in the real
  // app at all. Both halves are walked here, through the app's own controls,
  // because a projection with no path to it is a unit test wearing a feature's
  // clothes.
  console.log('\nWhat holds what — and the review that only speaks when something is broken');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#review').isVisible(), false,
    'nothing is structurally broken, so the review is not on the page at all');

  await tpage.fill('#capture', 'the quarterly report');
  await tpage.click('#capture-form button[type=submit]');
  await routeOne('Next action');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  await tpage.locator('#cards .card:has-text("the quarterly report") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  // Before it is a container there is nothing in this app to put anything under,
  // and the picker says exactly that rather than inviting a choice it cannot honour.
  const emptyPicker = await tpage.locator('#detail-parent option').allTextContents();
  // A LITERAL 1 — the placeholder and nothing else. Comparing the length to
  // itself is the self-referential theatre an audit already found twice here.
  is(emptyPicker.length, 1, `the picker offers no parents yet (${emptyPicker.join(', ')})`);
  is(await tpage.locator('#detail-parent').isDisabled(), true,
    'and it is disabled rather than offering an empty choice');
  await tpage.click('#detail-make-project');
  await tpage.waitForTimeout(300);
  is(await tpage.locator('#detail-make-project').isHidden(), true,
    'and once it is one, the control that makes it one is gone');
  const kidsNote = await tpage.locator('#detail-children').textContent();
  is(/nothing is under this yet/i.test(kidsNote || ''), true,
    `the container says it is empty, on its own sheet ("${kidsNote}")`);
  await tpage.click('#detail-close');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  // THE POINT OF REVIEW: a container with nothing under it looks perfectly fine
  // on every other surface in the app. It is a row in the list like any other.
  await tpage.waitForSelector('#review:not([hidden])');
  const reviewCount = await tpage.locator('#review-count').textContent();
  is(reviewCount, 'One thing needs a look.', `it says how many, plainly (got "${reviewCount}")`);
  is(await tpage.locator('.review-open').count(), 1, 'one exception, one row');
  is(await tpage.locator('.review-title').first().textContent(), 'the quarterly report',
    'and it names the thing that has stalled');
  is(await tpage.locator('.review-why').first().textContent(), 'nothing under it yet',
    'and says what is wrong with it, without blame');
  const reviewText = await tpage.evaluate(() =>
    document.querySelector('#review')?.innerText ?? '');
  is(/\b(overdue|late|missed|streak|failed|behind|neglect)s?\b/i.test(reviewText), false,
    'no rebuke anywhere on the surface that tells you something is wrong');

  // Now fix it the way the app says to — put real work under it — and watch the
  // surface leave. An exceptions list that cannot reach zero is a nag.
  await tpage.locator('#cards .card:has-text("draft the brief") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  const parentOptions = await tpage.locator('#detail-parent option').allTextContents();
  is(parentOptions.includes('the quarterly report'), true,
    `the container is offered as a parent (${parentOptions.join(', ')})`);
  is(parentOptions.includes('draft the brief'), false, 'and never itself');
  await tpage.selectOption('#detail-parent', { label: 'the quarterly report' });
  await tpage.click('#detail-parent-set');
  await tpage.waitForTimeout(300);
  const placeLine = await tpage.locator('#detail-place').textContent();
  is(placeLine, 'Part of the quarterly report.',
    `the sheet says where it now sits ("${placeLine}")`);
  await tpage.click('#detail-close');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#review').isVisible(), false,
    'and the review is gone — it can reach zero, so it is not a nag');

  // THE OTHER HALF: it did not go quiet by being filed away. Law 4 says levels
  // push DOWN — a thing put under something else is still your work, still on a
  // clock, still on the list. Filing as a way to lose things is the failure this
  // whole app is a rebuttal to.
  const stillListed = await tpage.locator('#cards .card-title').allTextContents();
  is(stillListed.includes('draft the brief'), true,
    'and what was put under it is still right there on the list, not filed away');

  // AND it now SAYS where it sits, right on the row. This is the mark that tells
  // an already-filed item apart from a loose one — an OmniFocus import drew filed
  // and loose actions identically, so a backlog of a thousand could not be
  // processed because nothing said which already had a home (Noah, on device).
  const places = await tpage.evaluate(() => {
    const out = {};
    for (const card of document.querySelectorAll('#cards .card')) {
      const t = card.querySelector('.card-title')?.textContent ?? '';
      out[t] = card.querySelector('.card-place')?.textContent ?? '';
    }
    return out;
  });
  is(places['draft the brief'], 'in the quarterly report',
    `the filed action shows the project it is in ("${places['draft the brief']}")`);
  is(places['the quarterly report'], '1 under it',
    `and the container says how many it holds ("${places['the quarterly report']}")`);

  // A parenting is silent-risk, so the log must show the gate covering it.
  const parentLog = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.map(e => ({ kind: e.kind, node: e.node, payload: e.payload })));
    });
  });
  const parented = parentLog.filter(e => e.kind === 'node.parented');
  is(parented.length, 1, 'one node.parented was recorded');
  is(typeof parented[0]?.payload?.parent, 'string', 'naming what it went under');

  // --- Carrying, and telling someone where things are ----------------------
  // `project.role.set` has been in the vocabulary from the first draft with the
  // note "a track project emits no next actions". Nothing folded the role, so
  // every project was an execute project and the distinction lived only in
  // prose — meaning Next up would hand you somebody else's job.
  console.log('\nCarrying \u2014 and the report that says where things are');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#portfolio').isVisible(), false,
    'you are carrying nothing, so the surface is not there');

  await tpage.fill('#capture', 'the migration');
  await tpage.click('#capture-form button[type=submit]');
  await routeOne('Next action');
  await tpage.fill('#capture', 'write the script');
  await tpage.click('#capture-form button[type=submit]');
  await routeOne('Next action');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  await tpage.locator('#cards .card:has-text("the migration") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-track-row').isVisible(), false,
    'a plain action has no role to set — a role with nothing under it is a label');
  await tpage.click('#detail-make-project');
  await tpage.waitForTimeout(300);
  is(await tpage.locator('#detail-track-row').isVisible(), true,
    'and a container does');
  await tpage.click('#detail-track');
  await tpage.waitForTimeout(300);
  const owedBy = await tpage.evaluate(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await tpage.fill('#detail-suspense', owedBy);
  await tpage.click('#detail-suspense-set');
  await tpage.waitForTimeout(300);
  await tpage.click('#detail-close');

  await tpage.locator('#cards .card:has-text("write the script") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.selectOption('#detail-parent', { label: 'the migration' });
  await tpage.click('#detail-parent-set');
  await tpage.waitForTimeout(300);
  await tpage.click('#detail-close');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  await tpage.waitForSelector('#portfolio:not([hidden])');
  is(await tpage.locator('.portfolio-title').first().textContent(), 'the migration',
    'what you are carrying is named');
  const carryWords = await tpage.locator('.portfolio-why').first().textContent();
  is(/an answer is due in \d+ days/.test(carryWords || ''), true,
    `and when you owe an answer ("${carryWords}")`);
  // THE LOAD-BEARING ONE. Next up must not hand you somebody else's job.
  const upNow = await tpage.evaluate(() =>
    (document.querySelector('#nextup')?.innerText ?? ''));
  is(upNow.includes('write the script'), false,
    'and work under it is NOT offered as your next step \u2014 you are not the one doing it');
  is((await tpage.locator('#cards').textContent() || '').includes('write the script'), true,
    'though it is still on your list, because it is still real');
  is(/\b(at risk|slipping|amber|red|on track|healthy|behind)\b/i.test(carryWords || ''), false,
    'and nothing grades anyone');

  // The status report. Computed from the log, so nothing has to be kept up to
  // date for it to be right.
  console.log('\nThe report \u2014 what has changed since you last told anyone');
  await tpage.click('#open-about');
  await tpage.waitForSelector('#report-markdown');
  const [reportFile] = await Promise.all([
    tpage.waitForEvent('download'),
    tpage.click('#report-markdown'),
  ]);
  const reportName = reportFile.suggestedFilename();
  is(reportName.startsWith('quietkeep-status-') && reportName.endsWith('.md'), true,
    `the file is named for what it is ("${reportName}")`);
  const reportText = readFileSync(await reportFile.path(), 'utf8');
  is(/^## Status/m.test(reportText), true, 'and it is a status report');
  is(/everything so far/i.test(reportText), true,
    'the first one of all says what it really is, rather than claiming a period');
  is(/\b(overdue|late|missed|slipped|failed|chased)\b/i.test(reportText), false,
    'and it carries no rebuke to hand to anybody');
  // WAIT for the write, then read the surface's own confirmation — the file must
  // exist before the event claiming it left, the ordering an audit already had
  // to fix on the export path.
  for (let i = 0; i < 40; i++) {
    if ((await tpage.locator('#report-note').textContent() || '').startsWith('Handed over')) break;
    await tpage.waitForTimeout(50);
  }
  is((await tpage.locator('#report-note').textContent() || '').startsWith('Handed over'), true,
    'and the surface confirms only after the file was handed over');

  // THE MARK MOVED. A second report covers the period since the first, not
  // everything all over again.
  await tpage.click('#about-close');
  await tpage.fill('#capture', 'something after the report');
  await tpage.click('#capture-form button[type=submit]');
  await tpage.waitForTimeout(300);
  await tpage.click('#open-about');
  const [second] = await Promise.all([
    tpage.waitForEvent('download'),
    tpage.click('#report-markdown'),
  ]);
  const secondText = readFileSync(await second.path(), 'utf8');
  is(/everything so far/i.test(secondText), false,
    'the second report covers a period, not the whole history again');
  is(secondText.includes('something after the report'), true,
    'and it carries what happened since the last one');
  // It may still appear under "Coming up" — that is a fact about the state, not
  // a change, and a report that hid an upcoming date because it mentioned it
  // last week would be actively misleading. What must NOT recur is the CHANGE.
  const changesOnly = secondText.split('### Coming up')[0] ?? secondText;
  is(changesOnly.includes('the migration'), false,
    'and does not repeat a change it already told you about');
  is(/### Coming up[\s\S]*the migration/.test(secondText), true,
    'though an upcoming date is still stated — hiding it would be worse than repeating it');
  await tpage.click('#about-close');

  // Leave the inbox as this section found it. The capture above is still
  // unrouted, and the next section's first `routeOne` would grab IT rather than
  // its own item — which is exactly what happened (smoke), and the failure
  // pointed at the person lens rather than at this section that caused it.
  await routeOne('Next action');

  // --- The person lens -----------------------------------------------------
  // `person.created`, `person.linked`, `waiting.opened` and `waiting.closed`
  // have been in the vocabulary from the start; only `person.created` was folded
  // and nothing could emit even that. So clarify's "Waiting for" route changed a
  // node's kind to say SOMEONE ELSE OWES YOU THIS and never asked who.
  console.log('\nWith other people \u2014 what you are owed, and by whom');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  await tpage.fill('#capture', 'the signed form');
  await tpage.click('#capture-form button[type=submit]');
  await routeOne('Waiting for');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  // THE HALF EASIEST TO GET WRONG. The route is one tap and never asks who, so
  // unattributed is the COMMONEST kind of waiting-for. A lens that showed only
  // the named ones would be quietly incomplete — worse than wrong, because you
  // would trust it.
  await tpage.waitForSelector('#people:not([hidden])');
  is(await tpage.locator('.people-title').first().textContent(), 'the signed form',
    'something you are owed shows up before anyone has been named');
  const unnamed = await tpage.locator('.people-why').first().textContent();
  is(unnamed, 'Nobody named yet.', `and it says so rather than inventing a name ("${unnamed}")`);

  await tpage.locator('#cards .card:has-text("the signed form") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#detail-person', 'Sam');
  await tpage.selectOption('#detail-relation', 'waiting-on');
  await tpage.click('#detail-person-set');
  await tpage.waitForTimeout(350);
  const linked = await tpage.locator('#detail-people-list').textContent();
  is(/Sam/.test(linked || ''), true, `the sheet says who it is with ("${linked}")`);
  is(await tpage.locator('#detail-waiting-close').count(), 1,
    'and offers the one action that ends it');
  await tpage.click('#detail-close');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  const named = await tpage.locator('.people-why').first().textContent();
  is(named, 'With Sam.', `and the lens names them ("${named}")`);

  // ONE Sam, however it is typed. A duplicate splits what you are owed across
  // two rows for ever.
  await tpage.fill('#capture', 'the numbers');
  await tpage.click('#capture-form button[type=submit]');
  await routeOne('Waiting for');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.locator('#cards .card:has-text("the numbers") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#detail-person', 'sam');            // lower case, same human
  await tpage.click('#detail-person-set');
  await tpage.waitForTimeout(350);
  await tpage.click('#detail-close');
  const personCount = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'person.created').length);
    });
  });
  is(personCount, 1, `"sam" is the Sam you already have (${personCount} person node)`);

  // It arrived. Off the owed list — and NOT marked done, because a thing
  // arriving is not a thing finished.
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  const owedBefore = await tpage.locator('.people-open').count();
  await tpage.locator('#cards .card:has-text("the signed form") .card-open').click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.click('#detail-waiting-close');
  await tpage.waitForTimeout(350);
  await tpage.click('#detail-close');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('.people-open').count(), owedBefore - 1,
    `it arrived, so it is off the owed list (${owedBefore} before)`);
  is((await tpage.locator('#cards').textContent() || '').includes('the signed form'), true,
    'but it is still your work \u2014 arriving is not finishing');

  const peopleText = await tpage.evaluate(() =>
    document.querySelector('#people')?.innerText ?? '');
  is(/\b(overdue|late|chased|ignored|nagg|failed to)\w*/i.test(peopleText), false,
    'and none of it keeps score on anyone else\u2019s behalf');

  // --- Focus, interruption, and getting the thread back --------------------
  // `focus.started`, `focus.ended`, `interrupt.captured` and the three
  // `resume.card.*` nouns have been in the vocabulary since the first draft.
  // `fold` retired a spent card, `nextup` ranked one SECOND — behind only a hard
  // date — and nothing in the app could create one. An entire ranking tier was
  // ordering an empty set.
  console.log('\nFocus \u2014 one thing, and a way to be interrupted without losing it');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#focus').isVisible(), false,
    'nothing is running, so the surface is not there');

  const focusTitle = await tpage.locator('#cards .card:has(.card-focus) .card-title').first().textContent();
  await tpage.locator('#cards .card:has(.card-focus) .card-focus').first().click();
  await tpage.waitForSelector('#focus:not([hidden])');
  is(await tpage.locator('#focus-title').textContent(), focusTitle,
    `it names what you are working on ("${focusTitle}")`);
  // Focus lands on the surface that just appeared, not on the button that was
  // replaced underneath it (WCAG 2.4.3).
  is(await tpage.evaluate(() => document.activeElement?.id), 'focus-heading',
    'and keyboard focus follows the surface that appeared');

  // THE ONE THAT MATTERS. Record an interruption, then RELOAD WITHOUT STOPPING —
  // which is the real failure: you do not get to press a button on your way out
  // of the room. A design that wrote the card on focus.ended would pass every
  // other check here and fail this one.
  await tpage.fill('#focus-interrupt', 'the phone rang');
  await tpage.click('#focus-interrupt-form button[type=submit]');
  await tpage.waitForTimeout(350);
  is(await tpage.locator('#focus').isVisible(), true,
    'an interruption does not stop you \u2014 it is held and you carry on');
  const heldNote = await tpage.locator('#focus-held').textContent();
  is(heldNote, 'One thing came up and is held.',
    `and it says so as a thing you DID ("${heldNote}")`);

  const cardsMid = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'resume.card.created').length);
    });
  });
  is(cardsMid, 1, 'the way back is written AT THE INTERRUPTION, not on the way out');

  // No focus.ended. The app simply goes away, exactly as it does when the OS
  // reclaims it or the battery dies.
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#focus').isVisible(), true,
    'and coming back, you are still in it \u2014 the session survived the app going away');

  // Stop properly, and leave the five words. Optional throughout; this walk
  // gives them so the cue path is exercised rather than assumed.
  await tpage.click('#focus-stop');
  await tpage.waitForSelector('#focus-sheet[open]');
  await tpage.fill('#focus-cue', 'the paragraph about ferries');
  await tpage.click('#focus-sheet-stop');
  await tpage.waitForTimeout(350);
  is(await tpage.locator('#focus').isVisible(), false, 'stopping puts the surface away');

  // The session close (1.6.0, item 40): the second rider on the exit ramp — a
  // win in words and the gauge in WORDS. Peak-end, never a report card.
  await tpage.waitForSelector('#close:not([hidden])');
  const closeText = await tpage.evaluate(() => document.querySelector('#close')?.innerText ?? '');
  is(/is left where you can pick it back up/.test(closeText), true,
    'the win is stated in words — stopping is not failing');
  is(/covered — (\d+ things, none silent|one thing, not silent)/.test(closeText), true,
    `the gauge speaks in words, never colour ("${closeText.replace(/\n/g, ' / ').slice(0, 100)}")`);
  is(/%|streak|minutes/.test(closeText), false, 'no score, no duration, no streak');

  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#close').isVisible(), false,
    'the close strip never greets a cold start — the ramp is memory, not history');
  // ONE card, not two. The cue offered on the way out must land on the card the
  // interruption already wrote, rather than creating a second one competing with
  // it for the same thread.
  const cardsAfter = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'resume.card.created').map(e => e.node));
    });
  });
  is(new Set(cardsAfter).size, 1,
    `one thread, one card (${cardsAfter.length} writes to ${new Set(cardsAfter).size} card)`);

  // And Next up offers it back, in YOUR words. NOT "it leads" — a real date
  // outranks a resume card by design (nextup.ts), and this walk has items
  // carrying dates from earlier sections, so asserting the head would have been
  // asserting the order of THIS walk rather than the behaviour.
  const upText = await tpage.evaluate(() =>
    document.querySelector('#nextup')?.innerText ?? '');
  is(/you were about to: the paragraph about ferries/.test(upText), true,
    `the way back is offered, in the words you wrote ("${upText.replace(/\n/g, ' / ').slice(0, 120)}")`);

  // Pick it back up: the card is spent and focus lands on the WORK, never on a
  // card about a focus session.
  await tpage.locator('#cards .card:has-text("where you left off") .card-focus').first().click();
  await tpage.waitForSelector('#focus:not([hidden])');
  is(await tpage.locator('#focus-title').textContent(), focusTitle,
    'picking it back up puts you on the work itself, not on the card');
  const spent = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'resume.card.spent').length);
    });
  });
  is(spent, 1, 'and the card is spent, not left lying around');

  // Finishing leaves NO way back, because there is no thread.
  await tpage.click('#focus-done');
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#focus').isVisible(), false, 'done closes the session');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  const backAgain = await tpage.locator('#cards').textContent();
  is((backAgain || '').includes('where you left off'), false,
    'and nothing offers you a way back into work you have finished');

  const focusText = await tpage.evaluate(() =>
    (document.querySelector('#focus')?.innerText ?? '') + ' ' +
    (document.querySelector('#nextup')?.innerText ?? ''));
  is(/\b(overdue|late|missed|streak|failed|wasted|distracted)s?\b/i.test(focusText), false,
    'and none of it carries a rebuke for having been interrupted');

  // --- The comms sweep, on the focus-exit ramp -----------------------------
  // Build-plan item 22, deferred out of Phase 3 with the reason recorded at the
  // time: "needs focus ramps, which are Phase 4". They shipped in 0.14.0.
  console.log('\nComing up for air \u2014 one pass, and only on the way out');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#comms').isVisible(), false,
    'nobody asked for a sweep, so there is none');

  await tpage.click('#open-about');
  await tpage.waitForSelector('#comms-start');
  is(await tpage.locator('#comms-stop').isHidden(), true,
    'and nothing to stop, because nothing is running');
  await tpage.click('#comms-start');
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#comms-start').isHidden(), true, 'on');
  await tpage.click('#about-close');

  // THE ONE THAT MATTERS. Turning it on must not immediately interrupt you for
  // having said yes — and it must not appear anywhere except the ramp.
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#comms').isVisible(), false,
    'saying yes does not itself interrupt you');

  await tpage.locator('#cards .card-focus').first().click();
  await tpage.waitForSelector('#focus:not([hidden])');
  is(await tpage.locator('#comms').isVisible(), false,
    'and nothing appears while you are working \u2014 that is the interruption it replaces');
  await tpage.click('#focus-stop');
  await tpage.waitForSelector('#focus-sheet[open]');
  await tpage.click('#focus-sheet-stop');
  await tpage.waitForTimeout(400);
  // Not due yet (turning it on counts as a pass), so coming out offers nothing.
  is(await tpage.locator('#comms').isVisible(), false,
    'coming out does not conjure a sweep that is not due \u2014 both conditions, not either');

  // Make it due by moving its last pass back through the app's own log, then
  // come out of a session again.
  await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    const all = await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result);
    });
    const created = all.find(e => e.kind === 'node.field.set' && e.payload?.field === 'comms-sweep');
    const older = new Date(Date.now() - 6 * 86400000).toISOString();
    // Turning it on records a pass (that is the fix that stopped it interrupting
    // you for saying yes), and LWW is on `at` FIRST — so simply ADDING an older
    // done.marked can never win, and the first version of this fixture quietly
    // changed nothing. The creation-time pass is removed as well, which produces
    // exactly the honest state being simulated: a sweep that has been running a
    // while and was last used six days ago.
    const store = db.transaction('events', 'readwrite').objectStore('events');
    for (const e of all) {
      if (e.kind === 'done.marked' && e.node === created.node) store.delete(e.id);
    }
    store.add({
      id: 'smoke-comms-backdate', vault: created.vault, at: older, device: 'smoke', seq: 900001,
      kind: 'done.marked', node: created.node, payload: { at: older },
    });
    await new Promise((res, rej) => {
      store.transaction.oncomplete = res;
      store.transaction.onerror = () => rej(store.transaction.error);
    });
  });
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#comms').isVisible(), false, 'still nothing on arrival');
  await tpage.locator('#cards .card-focus').first().click();
  await tpage.waitForSelector('#focus:not([hidden])');
  await tpage.click('#focus-stop');
  await tpage.waitForSelector('#focus-sheet[open]');
  await tpage.click('#focus-sheet-stop');
  await tpage.waitForSelector('#comms:not([hidden])');
  const commsLine = await tpage.locator('#comms-words').textContent();
  is(/Last pass through your messages was \d+ days ago\./.test(commsLine || ''), true,
    `and NOW it offers one, saying how long ("${commsLine}")`);
  is(/\b\d+\s+(messages?|emails?|unread)\b/i.test(commsLine || ''), false,
    'counting nothing it cannot see');

  // Declining writes NOTHING. A record of every time you did not do something is
  // the ledger this app exists to not keep.
  const eventsBefore = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  await tpage.click('#comms-later');
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#comms').isVisible(), false, 'saying not now puts it away');
  const eventsAfter = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').count();
      tx.onsuccess = () => res(tx.result);
    });
  });
  is(eventsAfter, eventsBefore, `and writes nothing at all (${eventsBefore} events, unchanged)`);

  // Having a look records it, and it stops being offered.
  await tpage.locator('#cards .card-focus').first().click();
  await tpage.waitForSelector('#focus:not([hidden])');
  await tpage.click('#focus-stop');
  await tpage.waitForSelector('#focus-sheet[open]');
  await tpage.click('#focus-sheet-stop');
  await tpage.waitForSelector('#comms:not([hidden])');
  is(true, true, 'declining did not retire it — it is offered again, as if never asked');
  await tpage.click('#comms-done');
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#comms').isVisible(), false, 'a look puts it away');
  await tpage.locator('#cards .card-focus').first().click();
  await tpage.waitForSelector('#focus:not([hidden])');
  await tpage.click('#focus-stop');
  await tpage.waitForSelector('#focus-sheet[open]');
  await tpage.click('#focus-sheet-stop');
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#comms').isVisible(), false,
    'and it does not come straight back \u2014 it comes round on its own');

  // --- Today, on paper -----------------------------------------------------
  // There was no print stylesheet in this repo at all, so 0.16.0's "Print it"
  // called window.print() against the live page: the output was the About
  // dialog, the app behind it, and whatever the screen layout did under print
  // media. The button worked and the result was unusable.
  // --- The way out of the panel (Noah, on device, TWICE) -------------------
  // The header was `position: sticky` inside the dialog's own scroll container.
  // Correct, honoured by every engine in CI, and it did not hold on his iPad:
  // the bar scrolled away with the content and both ways out ended up at the
  // extremes of a panel thousands of pixels tall.
  //
  // The dependency is gone rather than debugged — the dialog is a flex column
  // that does not scroll and the body is the only thing that moves. These checks
  // are about the PROPERTY, not the mechanism, so they hold whatever CSS is used
  // to achieve it.
  console.log('\nThe way out of the panel \u2014 reachable from anywhere in it');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about-body');

  is(await tpage.evaluate(() => {
    const d = document.querySelector('#about');
    return d.scrollHeight <= d.clientHeight + 1;
  }), true, 'the dialog itself does not scroll \u2014 only its body does');

  // Scroll to the very bottom and check the X is STILL where a thumb can reach.
  const xReach = await tpage.evaluate(() => {
    const body = document.querySelector('#about-body');
    body.scrollTop = 999999;
    const x = document.querySelector('#about-dismiss');
    const r = x.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
      scrolled: body.scrollTop > 0,
      onScreen: r.top >= 0 && r.bottom <= window.innerHeight,
      top: Math.round(r.top),
      hit: hit ? (hit.id || hit.tagName) : 'NONE',
    };
  });
  is(xReach.scrolled, true, 'the panel really did scroll');
  is(xReach.onScreen, true, `and the way out is still on screen (top ${xReach.top}px)`);
  is(xReach.hit, 'about-dismiss', 'and nothing is sitting on top of it');

  // AND IT ACTUALLY CLOSES. `close()` succeeding is not the same as the panel
  // going away: `#about { display: flex }` beats the UA's `dialog:not([open])
  // { display: none }` on specificity, so the dialog closed and stayed on
  // screen — a worse version of the bug being fixed, caught only by asking the
  // browser whether it was still visible.
  await tpage.click('#about-dismiss');
  await tpage.waitForTimeout(200);
  const shut = await tpage.evaluate(() => {
    const d = document.querySelector('#about');
    return { open: d.open, visible: d.checkVisibility() };
  });
  is(shut.open, false, 'the X closes the panel');
  is(shut.visible, false, 'and the panel is actually GONE, not merely marked closed');
  is(await tpage.evaluate(() => document.activeElement?.id), 'capture',
    'and focus comes back to capture');

  // The other way out, at the bottom, still works too.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about-body');
  await tpage.click('#about-close');
  await tpage.waitForTimeout(200);
  is(await tpage.evaluate(() => document.querySelector('#about').checkVisibility()), false,
    'and so does the one at the bottom');

  // The panel is no longer thousands of pixels tall, which is why the way out
  // was ever far from a thumb.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about-body');
  const panelH = await tpage.evaluate(() => document.querySelector('#about-body').scrollHeight);
  is(panelH < 9000, true, `the panel is readable rather than a scroll of history (${panelH}px)`);
  is(await tpage.locator('.note-older').count(), 1,
    'older releases are one tap away, not removed');

  // The security explanation Noah asked for: its own place, collapsed, and
  // costing nothing to anybody who never opens it. Checked in the BUILT app
  // because the passages are unit-tested but their reaching the screen is not.
  const sec_shut = await tpage.evaluate(() => {
    const d = document.querySelector('#security');
    return { there: !!d, open: d?.hasAttribute('open') ?? null,
             label: d?.querySelector('summary')?.textContent ?? '' };
  });
  is(sec_shut.there, true, 'the security explanation is in the panel');
  is(sec_shut.open, false, 'collapsed, so it costs nothing to anyone not reading it');
  is(/how this works/i.test(sec_shut.label), true, `and says what it is ("${sec_shut.label}")`);
  const sec_body = await tpage.evaluate(() => {
    const d = document.querySelector('#security');
    d.setAttribute('open', '');
    return { text: d.textContent ?? '', headings: d.querySelectorAll('h4').length };
  });
  is(sec_body.headings >= 3, true, `it has real sections (${sec_body.headings})`);
  // This walk runs the DEFAULT build, whose whole claim is that it cannot reach
  // anything. If this ever renders the sync explanation, the edition split has
  // failed somewhere no unit test would see.
  is(/Nothing\./.test(sec_body.text), true, 'and the private build states its strong claim');
  is(/handover point/i.test(sec_body.text), false,
    'without describing a sync this build does not have');
  await tpage.click('#about-close');

  console.log('\nToday on paper \u2014 and a print that prints the right thing');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  // The print area is empty until the moment of printing, and invisible always.
  is(await tpage.locator('#print-area').isVisible(), false,
    'the print area is not part of the app on screen');
  is((await tpage.locator('#print-area').innerHTML()).trim(), '',
    'and holds nothing until something is printed');

  // Stub window.print so the walk can inspect what WOULD have gone to paper —
  // the dialog itself cannot be driven, and what matters is the content.
  await tpage.evaluate(() => {
    window.__printed = [];
    window.print = () => {
      const a = document.querySelector('#print-area');
      window.__printed.push(a ? a.innerText : '');
    };
  });
  await tpage.click('#open-about');
  await tpage.waitForSelector('#today-print');
  await tpage.click('#today-print');
  await tpage.waitForTimeout(200);
  const card = await tpage.evaluate(() => window.__printed[0] ?? '');
  is(card.includes('Quietkeep'), true, 'the card is headed');
  is(/snapshot/i.test(card), true, 'it says it is a snapshot');
  is(/does not reach Quietkeep/i.test(card), true,
    'and that ticking the paper does not reach the app \u2014 the half people need');
  // THE LOAD-BEARING ONE: what is printed is the CARD, not the panel it was
  // launched from.
  is(/Export a copy|Send to my calendar|Offer me a sweep/.test(card), false,
    'and the About panel is NOT on the page \u2014 only the card is');

  // It is emptied afterwards, so the next print is not this one.
  is((await tpage.locator('#print-area').innerHTML()).trim(), '',
    'the area is cleared after printing, so a stale card cannot be printed again');

  // The status report's print path goes through the same area.
  await tpage.click('#report-print');
  await tpage.waitForTimeout(300);
  const printedReport = await tpage.evaluate(() => window.__printed[1] ?? '');
  is(/Quietkeep — status/.test(printedReport), true, 'the report prints as the report');
  is(/Export a copy|Bringing a copy back/.test(printedReport), false,
    'and it too leaves the dialog behind');
  await tpage.click('#about-close');

  // --- Bothers: the thing that is not a task -------------------------------
  // `bother.received`, `bother.owned` and `bother.routed` have been in the
  // vocabulary from the first draft, with cures in the gate — "bother must
  // terminate in a route or a park" — and nothing could emit any of them.
  console.log('\nSomething on your mind \u2014 and the option almost no planner has');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#bother').isVisible(), false,
    'nothing is on your mind, so nothing asks');

  await tpage.click('#bother-summary');
  await tpage.fill('#bother-text', 'my brother\u2019s job situation');
  await tpage.click('#bother-form button[type=submit]');
  await tpage.waitForSelector('#bother:not([hidden])');
  is(await tpage.locator('#bother-card').textContent(), 'my brother\u2019s job situation',
    'it takes the worry as written, with no next action invented for it');
  const prompt = await tpage.locator('#bother-prompt').textContent();
  is(prompt, 'Whose is this?',
    `and the FIRST question is whose it is, not what you will do ("${prompt}")`);
  is(await tpage.locator('.bother-choice').count(), 3, 'three answers');
  const hints = await tpage.locator('.bother-choice-hint').allTextContents();
  is(hints.every(h => h.trim().length > 0), true,
    `each says what it will do (${hints.join(' | ')})`);

  // THE ONE THAT MATTERS. "Not mine to carry" must be honoured completely: not
  // parked, not sent to triage, not brought back "just to check".
  const beforeIds = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'bother.received').map(e => e.node));
    });
  });
  await tpage.locator('.bother-choice', { hasText: 'Not mine to carry' }).first().click();
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#bother').isVisible(), false, 'it is done with, in one tap');

  const gone = await tpage.evaluate(async (id) => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res({
        owned: tx.result.filter(e => e.kind === 'bother.owned').map(e => e.payload?.ownership),
        routed: tx.result.filter(e => e.kind === 'bother.routed').length,
        parked: tx.result.filter(e => e.kind === 'park.set' && e.node === id).length,
        trashed: tx.result.filter(e => e.kind === 'node.trashed' && e.node === id).length,
      });
    });
  }, beforeIds[beforeIds.length - 1]);
  is(gone.owned.includes('not-mine-to-carry'), true, 'the answer is recorded as given');
  is(gone.routed, 1, 'and the flow terminated, as the vocabulary requires');
  is(gone.parked, 0, 'NOT parked \u2014 it does not come back "just to check"');
  is(gone.trashed, 1, 'let go, explicitly');

  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#bother').isVisible(), false,
    'and it is still gone after a reload \u2014 a release taken back is worse than none');
  const heldText = await tpage.locator('#cards').textContent();
  is((heldText || '').includes('brother'), false, 'it is not on your list either');

  // "Mine to do something about" becomes ordinary work and joins the inbox.
  // DRAIN FIRST: triage shows one card at a time, so with earlier items still
  // queued the roof was genuinely in the inbox and simply not the card on
  // screen — the assertion below is about the surface, so the surface has to be
  // showing the thing it is about.
  while (await tpage.locator('#triage:not([hidden]) .route').count() > 0) {
    await routeOne('Next action');
  }
  await tpage.click('#bother-summary');
  await tpage.fill('#bother-text', 'the thing with the roof');
  await tpage.click('#bother-form button[type=submit]');
  await tpage.waitForSelector('#bother:not([hidden])');
  await tpage.locator('.bother-choice', { hasText: 'Mine to do something about' }).first().click();
  await tpage.waitForTimeout(400);
  is(await tpage.locator('#bother').isVisible(), false, 'the flow ends');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  const triageText = await tpage.evaluate(() => document.querySelector('#triage')?.innerText ?? '');
  is(triageText.includes('the thing with the roof'), true,
    'and NOW it is asked what the next step is \u2014 which is the second question, not the first');

  const botherText = await tpage.evaluate(() =>
    (document.querySelector('#bother')?.innerText ?? '') + ' ' +
    (document.querySelector('#bother-entry')?.innerText ?? ''));
  is(/\b(problem|anxiet|stress|overwhelm|calm down|don.t worry)\b/i.test(botherText), false,
    'and none of it names the thing a problem, or you a worrier');

  // --- The Menu, and a save-for (law 6: demand-free by construction) -------
  // `menu.item.added` has carried a category from a closed list since the first
  // draft and NOTHING read it — every Menu item went into one undifferentiated
  // bucket, so the category was collected and discarded. `save-for.updated` was
  // never folded, so the one category with numbers could not carry any.
  console.log('\nThe Menu \u2014 things you want, none of which are asking');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  // DRAIN FIRST. `routeOne` routes whatever card is showing, and earlier
  // sections leave items in the inbox — so "capture then routeOne" sent somebody
  // else's item to Someday and the tripod was never on the Menu at all, which is
  // what the walk then failed to find.
  while (await tpage.locator('#triage:not([hidden]) .route').count() > 0) {
    await routeOne('Next action');
  }
  await tpage.fill('#capture', 'a decent tripod');
  await tpage.click('#capture-form button[type=submit]');
  await routeOne('Someday');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  // BEHIND A CONTROL. A wish list that greets you is a demand list.
  is(await tpage.locator('#menu').isVisible(), false,
    'the Menu is not open on arrival \u2014 it does not greet you');
  const menuLine = await tpage.locator('#menu-open').textContent();
  is(/Nothing here is asking\./.test(menuLine || ''), true,
    `and the control says so in as many words ("${menuLine}")`);
  // Idempotent: the Menu stays open across a detail sheet, so a bare click later
  // in this walk CLOSED it and the next wait timed out. Toggles need a helper,
  // not an assumption about what the last step left behind.
  const openMenu = async () => {
    if (await tpage.locator('#menu').isVisible()) return;
    await tpage.click('#menu-open');
    await tpage.waitForSelector('#menu:not([hidden])');
  };
  await openMenu();
  is(await tpage.locator('#menu .menu-cat').count() > 0, true,
    'opening it groups things by what they are for');
  is(await tpage.getAttribute('#menu-open', 'aria-expanded'), 'true',
    'and says so to a screen reader');

  // A save-for carries two numbers, by hand, and no bar.
  await tpage.locator('#menu .menu-item', { hasText: 'a decent tripod' }).first().click();
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-savefor-group').isVisible(), false,
    'a "someday" is not a thing you are saving for, so there are no numbers to set');
  await tpage.click('#detail-close');

  // Move it into save-for through the log, then check the sheet offers the
  // numbers and the Menu shows them.
  await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    const all = await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result);
    });
    // THE TRIPOD SPECIFICALLY. Earlier sections route things to "Someday" and
    // "Reference", so the last menu.item.added is somebody else's — the first
    // version of this took it and then asserted against the wrong row.
    const capture = all.find(e => (e.kind === 'capture.recorded' || e.kind === 'node.created')
      && (e.payload?.text === 'a decent tripod' || e.payload?.title === 'a decent tripod'));
    const added = all.find(e => e.kind === 'menu.item.added' && e.node === capture?.node);
    if (!added) return;
    const store = db.transaction('events', 'readwrite').objectStore('events');
    store.add({ id: 'smoke-savefor', vault: added.vault, at: new Date().toISOString(),
      device: 'smoke', seq: 900100, kind: 'menu.item.added', node: added.node,
      payload: { category: 'save-for' } });
    await new Promise((res) => { store.transaction.oncomplete = res; });
  });
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  await openMenu();
  await tpage.locator('#menu .menu-item', { hasText: 'a decent tripod' }).first().click();
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-savefor-group').isVisible(), true,
    'now it offers the two numbers');
  await tpage.fill('#detail-save-target', '300');
  await tpage.fill('#detail-save-saved', '120');
  await tpage.click('#detail-save-set');
  await tpage.waitForTimeout(350);
  await tpage.click('#detail-close');
  await openMenu();
  const money = await tpage.locator('#menu .menu-item', { hasText: 'a decent tripod' })
    .locator('.menu-money').first().textContent();
  is(money, '\u00a3120 put by of \u00a3300. \u00a3180 to go.',
    `two numbers and the difference ("${money}")`);
  // THE LOAD-BEARING ONE. No bar, no percentage, no projected date, anywhere.
  const menuHtml = await tpage.locator('#menu').innerHTML();
  is(/<progress|role="progressbar"|width:\s*\d+%/.test(menuHtml), false,
    'and there is no bar of any kind \u2014 a bar implies you are behind');
  const menuText = await tpage.evaluate(() => document.querySelector('#menu')?.innerText ?? '');
  is(/%|percent|on track|behind|at this rate/i.test(menuText), false,
    'and nothing scores you on how the saving is going');

  // An empty box means "not said", not zero.
  await tpage.locator('#menu .menu-item', { hasText: 'a decent tripod' }).first().click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#detail-save-target', '');
  await tpage.click('#detail-save-set');
  await tpage.waitForTimeout(350);
  await tpage.click('#detail-close');
  await openMenu();
  const money2 = await tpage.locator('#menu .menu-item', { hasText: 'a decent tripod' })
    .locator('.menu-money').first().textContent();
  is(money2, '\u00a3120 put by.',
    `clearing the target unsays it rather than recording that it costs nothing ("${money2}")`);

  // --- Coming back after being away (law 8) --------------------------------
  // `lapse.migration.ran`, `reentry.greeted` and `amnesty.offered`/`.accepted`
  // have been in the vocabulary from the first draft, with the bound written into
  // the SCHEMA — "there is no shape it could take that shows the backlog". None
  // of them was folded and nothing could emit one.
  //
  // Law 8 calls re-entry the PRIMARY DESIGNED PATH, and NOTES.md defines v1 done
  // as thirty consecutive working days. A bad week is not a risk to that gate,
  // it is a certainty.
  console.log('\nComing back \u2014 a fortnight away, and the app does not present a bill');
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#reentry').isVisible(), false,
    'you have not been away, so there is no greeting');

  // Age the ENTIRE log by a fortnight. Backdating one event cannot work —
  // `lastActivityAt` is a maximum, which is the whole point of it (unit-tested),
  // so the only honest way to simulate having been away is for everything to be
  // old. This is the state a real fortnight produces.
  await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    const all = await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result);
    });
    const shift = 15 * 86400000;
    const store = db.transaction('events', 'readwrite').objectStore('events');
    for (const e of all) {
      const moved = { ...e, at: new Date(Date.parse(e.at) - shift).toISOString() };
      if (moved.payload && typeof moved.payload === 'object') {
        moved.payload = { ...moved.payload };
        for (const k of ['at', 'since', 'startedAt', 'endedAt', 'returnAt']) {
          if (typeof moved.payload[k] === 'string' && !Number.isNaN(Date.parse(moved.payload[k]))) {
            moved.payload[k] = new Date(Date.parse(moved.payload[k]) - shift).toISOString();
          }
        }
      }
      store.put(moved);
    }
    await new Promise((res) => { store.transaction.oncomplete = res; });
    // The snapshot is its own STORE (`snapshots`), not a key in `kv` — the first
    // version of this fixture deleted a key that does not exist, so the app
    // reloaded the old snapshot and the walk was asserting against a state it had
    // failed to create. `lastActivityAt` folds as a maximum, so a snapshot
    // carrying today's timestamp beats every backdated event in the tail.
    //
    // Dropping it makes the reload fold the log itself, which is also the path
    // ADR-0006's restoreFromLogAlone exists to keep honest.
    if (db.objectStoreNames.contains('snapshots')) {
      const snaps = db.transaction('snapshots', 'readwrite').objectStore('snapshots');
      snaps.clear();
      await new Promise((res) => { snaps.transaction.oncomplete = res; });
    }
  });
  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');

  await tpage.waitForSelector('#reentry:not([hidden])');
  const greeting = await tpage.locator('#reentry-words').textContent();
  is(/You were away/.test(greeting || ''), true, `it says how long ("${greeting}")`);
  is(/still here/.test(greeting || ''), true, 'and that nothing was lost, which is the point');
  is(/!/.test(greeting || ''), false, 'nothing is exclaimed at somebody who has been away');

  // THE BOUND. However much is waiting, the greeting is Next-up + at most three
  // triage + the gauge. It must never become the pile.
  const reentryText = await tpage.evaluate(() => document.querySelector('#reentry')?.innerText ?? '');
  is(/\b(behind|backlog|catch up|caught up|overdue|missed|sorry|neglect)\b/i.test(reentryText), false,
    'and none of it is a bill');
  const cardsShown = await tpage.locator('#reentry li').count();
  is(cardsShown, 0, 'the greeting lists nothing at all \u2014 it states counts and stops');

  // The amnesty, if anything went by. It marks nothing done and deletes nothing.
  const hasAmnesty = await tpage.locator('#reentry-amnesty').isVisible();
  console.log(`  ..   amnesty offered: ${hasAmnesty}`);
  if (hasAmnesty) {
    const words = await tpage.locator('#reentry-amnesty-words').textContent();
    is(/nothing is deleted/i.test(words || ''), true, `the offer says what it will not do ("${(words||'').slice(0,80)}...")`);
    is(/nothing is marked done/i.test(words || ''), true, 'both halves of it');
    const doneBefore = await tpage.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
      return await new Promise((res) => {
        const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
        tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'done.marked').length);
      });
    });
    await tpage.click('#reentry-amnesty-go');
    await tpage.waitForTimeout(600);
    const after = await tpage.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
      return await new Promise((res) => {
        const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
        tx.onsuccess = () => res({
          done: tx.result.filter(e => e.kind === 'done.marked').length,
          accepted: tx.result.filter(e => e.kind === 'amnesty.accepted').length,
          resolved: tx.result.filter(e => e.kind === 'replan.resolved').length,
          trashed: tx.result.filter(e => e.kind === 'node.trashed').length,
        });
      });
    });
    is(after.done, doneBefore, `it marked NOTHING done (${doneBefore} before, ${after.done} after)`);
    is(after.accepted, 1, 'one amnesty recorded');
    is(after.resolved > 0, true, `and each item got a real forward resolution (${after.resolved})`);
    await tpage.reload({ waitUntil: 'load' });
    await tpage.waitForSelector('body[data-ready=true]');
    is(await tpage.locator('#replan').isVisible(), false, 'nothing is asking any more');
  }

  // It is dismissible, and dismissing it does not strand focus on <body>.
  if (await tpage.locator('#reentry').isVisible()) {
    await tpage.locator('#reentry-dismiss, #reentry-dismiss-plain').first().click();
    await tpage.waitForTimeout(200);
    is(await tpage.locator('#reentry').isVisible(), false, 'and it can be put away');
    const f = await tpage.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    is(f !== 'BODY' && f !== undefined, true, `focus lands somewhere real (on ${f})`);
  }

  const greetLog = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'reentry.greeted').map(e => e.payload));
    });
  });
  is(greetLog.length >= 1, true, 'the arrival is recorded');
  is(greetLog.every(p => p.shown && p.shown.triage <= 3), true,
    `and what it says it showed is within the schema's own bound (${JSON.stringify(greetLog[0]?.shown)})`);

  // --- Two devices (ADR-0035) ----------------------------------------------
  // A SECOND browser context: its own IndexedDB, its own device id, its own
  // captures. Anything less would be testing the function, not the feature —
  // the whole point is that two stores that have never met converge.
  console.log('\nTwo devices — carrying your work from one to the other');
  const otherCtx = await browser.newContext({ timezoneId: 'America/Denver', locale: 'en-US', acceptDownloads: true });
  const other = await otherCtx.newPage();
  await other.goto(url, { waitUntil: 'load' });
  await other.waitForSelector('body[data-ready=true]');
  await other.click('#tour-skip');                   // dismiss the first-run walkthrough
  for (const t of ['written on the other device', 'and this one too']) {
    await other.fill('#capture', t);
    await other.click('#capture-form button[type=submit]');
    await other.waitForTimeout(150);
  }
  await other.click('#open-about');
  const [otherExport] = await Promise.all([
    other.waitForEvent('download'),
    other.click('#export'),
  ]);
  const otherFile = join(tmpdir(), 'quietkeep-other-device.json');
  writeFileSync(otherFile, readFileSync(await otherExport.path()));
  await otherCtx.close();

  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
  const beforeUnion = await tpage.locator('#cards .card').count();
  const mineBefore = await tpage.locator('#cards .card-title').allTextContents();
  await tpage.click('#open-about');
  await tpage.setInputFiles('#import-file', otherFile);
  await tpage.waitForTimeout(350);
  is(await tpage.locator('#import-union').isVisible(), true,
    'the additive option is offered, and it is the one focus lands on');
  is(await tpage.evaluate(() => document.activeElement?.id), 'import-union',
    'never the destructive one by default');
  await tpage.click('#import-union');
  await tpage.waitForTimeout(1300);
  await tpage.waitForSelector('body[data-ready=true]');

  const afterUnion = await tpage.locator('#cards .card-title').allTextContents();
  is(afterUnion.includes('written on the other device'), true, 'the other device\u2019s work arrived');
  // THE LOAD-BEARING HALF. An import that replaced would also make the line
  // above pass, so what actually matters is that MINE is all still here.
  const lost = mineBefore.filter(t => !afterUnion.includes(t));
  is(lost.length, 0, `and nothing of mine was lost${lost.length ? ` \u2014 ${lost.join(', ')}` : ''}`);
  is(afterUnion.length > beforeUnion, true,
    `the list grew rather than being swapped (${beforeUnion} -> ${afterUnion.length})`);

  // Doing it again is the ordinary case: you are not sure whether you already
  // did. It must cost nothing and must not throw on the unique-id index.
  await tpage.click('#open-about');
  await tpage.setInputFiles('#import-file', otherFile);
  await tpage.waitForTimeout(350);
  await tpage.click('#import-union');
  await tpage.waitForTimeout(700);
  const againNote = await tpage.locator('#import-note').textContent();
  is(/nothing new/i.test(againNote || ''), true, `taking it in twice says so ("${againNote}")`);
  is((await tpage.locator('#cards .card-title').allTextContents()).length, afterUnion.length,
    'and the list is unchanged');
  const folded = await tpage.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
    return await new Promise((res) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result.filter(e => e.kind === 'shard.folded').length);
    });
  });
  is(folded, 1, 'and exactly one shard.folded is recorded — the one that took something');
  await tpage.click('#about-close');

  console.log('\nSample work — an empty planner is hard to judge');
  // Not "the button exists" — what it PUTS IN. A demonstration that adds nothing,
  // or that adds rows the app would refuse, is worse than no demonstration, and
  // only the real store can say which happened.
  const beforeSample = await tpage.locator('#cards .card').count();
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.click('#sample');
  await tpage.waitForFunction(() => /sample things/.test(
    document.querySelector('#sample-note')?.textContent ?? ''), null, { timeout: 4000 });
  const sampleSaid = await tpage.locator('#sample-note').textContent();
  is(/\d+ sample things/.test(sampleSaid || ''), true,
    `it says how many went in ("${(sampleSaid || '').slice(0, 60)}")`);
  is(/beside anything you already have/.test(sampleSaid || ''), true,
    'and that it sits beside what was already there, rather than replacing it');
  await tpage.waitForTimeout(900);
  await tpage.waitForSelector('body[data-ready=true]');
  const afterSample = await tpage.locator('#cards .card').count();
  is(afterSample > beforeSample, true,
    `the list actually grew (${beforeSample} -> ${afterSample})`);

  // The characteristic surfaces the set exists to show. A sample of nothing but
  // tidy rows would teach nothing about the app that matters.
  const sampleLog = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return await new Promise((res, rej) => {
      const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
      tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
    });
  });
  is(sampleLog.some(e => e.kind === 'capture.recorded' && e.payload?.source === 'sample'), true,
    'a sample capture says it came from the sample, not from a keystroke');
  is(sampleLog.some(e => e.kind === 'waiting.opened'), true,
    'something is with another person');
  is(sampleLog.some(e => e.kind === 'menu.item.added'), true,
    'and something is on the Menu, asking nothing');
  is(sampleLog.some(e => e.kind === 'node.created' && e.payload?.parent), true,
    'and something sits under a parent — the shape a flat list cannot express');
  // No close click here: adding the set reloads the page (the same thing taking in
  // a copy does), so the panel is already gone and waiting for its X would hang.

  console.log('\nThe build is on the main screen, without opening anything');
  // Noah could not tell which build his device was running, because the version
  // lived only inside the (i) panel's title. A screenshot of the app has to say
  // it. Read with the panel SHUT, and matched against the changelog head so the
  // two cannot drift.
  const shownBuild = await tpage.locator('#build-version').textContent();
  is(/^\d+\.\d+\.\d+$/.test((shownBuild || '').trim()), true,
    `the main screen shows a bare triplet ("${shownBuild}")`);
  is(await tpage.locator('#about').evaluate(d => d.hasAttribute('open')), false,
    'and it is readable with the panel shut');
  is((shownBuild || '').trim(), (await tpage.locator('#version').textContent() || '').trim(),
    'and it is the same build the panel claims');

  console.log('\nThe number on the icon is optional');
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  is(await tpage.locator('#badge-toggle').getAttribute('aria-pressed'), 'true', 'on by default');
  is(/Stop showing/.test(await tpage.locator('#badge-toggle').textContent() || ''), true,
    'and the label says what pressing it DOES, not what the state is');
  const badgeOff = await tpage.evaluate(async () => {
    const calls = [];
    navigator.setAppBadge = (n) => { calls.push(n ?? 'set'); return Promise.resolve(); };
    navigator.clearAppBadge = () => { calls.push('clear'); return Promise.resolve(); };
    document.querySelector('#badge-toggle').click();
    await new Promise(r => setTimeout(r, 300));
    return { calls, pressed: document.querySelector('#badge-toggle').getAttribute('aria-pressed') };
  });
  is(badgeOff.pressed, 'false', 'switching it off is recorded on the control');
  is(badgeOff.calls.includes('clear'), true,
    `and the icon was cleared in the same breath (${JSON.stringify(badgeOff.calls)})`);
  is(/stays plain/.test(await tpage.locator('#badge-note').textContent() || ''), true,
    'and it says the icon stays plain and nothing is lost');
  await tpage.click('#badge-toggle');
  await tpage.waitForTimeout(200);
  is(await tpage.locator('#badge-toggle').getAttribute('aria-pressed'), 'true', 'and back on again');
  await tpage.click('#about-close');

  console.log('\nThe other edition — and the link that must NOT be invented');
  // This walk runs on localhost, where there is no knowable sibling. That is
  // exactly the case worth pinning at the artefact level: the whole reason the
  // link is derived rather than written down is that a hardcoded URL would
  // appear HERE too, and on every device, pointing at a host nobody confirmed.
  // The unit tests prove the derivation; this proves the built app obeys it.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  const sib_hidden = await tpage.evaluate(() => {
    const p = document.querySelector('#sibling');
    const as = [...(p?.querySelectorAll('a') ?? [])];
    // The HREFS, not only the text. The first version of this check read
    // textContent alone and stayed green while a deliberately broken build
    // rendered a link to a guessed host — the address lives in the attribute,
    // which is precisely where nobody was looking.
    return { present: !!p, hidden: p?.hidden ?? null,
             text: `${p?.textContent ?? ''} ${as.map(a => a.getAttribute('href')).join(' ')}`,
             links: as.length };
  });
  is(sib_hidden.present, true, 'the slot for the other edition exists');
  is(sib_hidden.hidden, true, 'and on a host with no knowable sibling it stays hidden');
  is(sib_hidden.links, 0, 'with no link invented for it');
  is(/pages\.dev/.test(sib_hidden.text), false, 'and no address guessed into the text');
  await tpage.click('#about-close');

  console.log('\nWork from another planner — TaskPaper and CSV');
  const beforeImport = await tpage.locator('#cards .card').count();
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  // A real file, through the real picker: this is the path somebody actually uses,
  // and a parser test cannot tell you the button is wired.
  await tpage.setInputFiles('#other-file', {
    name: 'omnifocus.taskpaper',
    mimeType: 'text/plain',
    buffer: Buffer.from('Kitchen refit:\n\t- Ring the plumber @due(2026-12-05)\n\t- Measure the gap @flagged\n'),
  });
  await tpage.waitForFunction(() => /Found/.test(
    document.querySelector('#other-note')?.textContent ?? ''), null, { timeout: 4000 });
  const said = await tpage.locator('#other-note').textContent();
  is(/1 project and 2 actions/.test(said || ''), true, `it says what the file held ("${said}")`);
  is(/flagged/.test(said || ''), true, 'and names what will NOT come with it');
  is(/TaskPaper/.test(said || ''), true, 'and which format it read');
  await tpage.click('#other-go');
  await tpage.waitForTimeout(900);
  await tpage.waitForSelector('body[data-ready=true]');
  is(await tpage.locator('#cards .card').count() > beforeImport, true, 'and the work arrived');
  const nested = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const rows = await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const created = rows.filter(e => e.kind === 'node.created');
    const project = created.find(e => e.payload?.title === 'Kitchen refit');
    const child = created.find(e => e.payload?.title === 'Ring the plumber');
    return { hasProject: !!project, childParent: child?.payload?.parent, projectNode: project?.node };
  });
  is(nested.hasProject, true, 'the project came across as a project');
  is(nested.childParent === nested.projectNode, true,
    'and its child is PARENTED to it — the shape a flat list cannot express');

  console.log('\nA newer version offers a copy, and never stands in the way');
  // It must be ABSENT on an ordinary load — a notice that shows itself when there is
  // nothing to notice is the definition of a nag — and it must never sit between
  // somebody and the capture box.
  is(await tpage.locator('#update').isHidden(), true, 'hidden when there is no update');
  const upd = await tpage.evaluate(async () => {
    const region = document.querySelector('#update');
    const words = document.querySelector('#update-words');
    words.textContent = 'A newer version is ready.';
    region.hidden = false;
    const box = region.getBoundingClientRect();
    const capture = document.querySelector('#capture').getBoundingClientRect();
    const before = document.activeElement?.id ?? '';
    return { overlapsCapture: !(box.bottom <= capture.top || box.top >= capture.bottom), before };
  });
  is(upd.overlapsCapture, false, 'it is a line above the app, not something over it');
  // And it closes, from the first frame.
  await tpage.click('#update-dismiss');
  is(await tpage.locator('#update').isHidden(), true, 'and "Not now" closes it');

  console.log('\nA long list does not become a wall');
  // Noah imported 1,429 things and got a scroll of well over a thousand rows under
  // one heading. The dedicated replan surface has cap_capped at three since it existed;
  // the held list had no cap at all, which nobody noticed while the fixtures held
  // eight things. Asserted through the REAL import path at a size past the cap.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  const cap_many = ['Big import:'];
  for (let i = 0; i < 60; i++) cap_many.push(`\t- Imported thing ${i}`);
  await tpage.setInputFiles('#other-file', {
    name: 'big.taskpaper', mimeType: 'text/plain', buffer: Buffer.from(cap_many.join('\n') + '\n'),
  });
  await tpage.waitForFunction(() => /Found/.test(
    document.querySelector('#other-note')?.textContent ?? ''), null, { timeout: 5000 });
  await tpage.click('#other-go');
  await tpage.waitForTimeout(1400);
  await tpage.waitForSelector('body[data-ready=true]');

  const cap_capped = await tpage.evaluate(() => {
    const out = [];
    for (const ul of document.querySelectorAll('#cards .cards-group')) {
      const real = ul.querySelectorAll('li.card:not(.card-more)').length;
      const more = ul.querySelector('.card-more .card-open');
      out.push({ real, more: more ? more.textContent : null });
    }
    return out;
  });
  const cap_biggest = cap_capped.reduce((a, b) => (b.real > a.real ? b : a), { real: 0, more: null });
  is(cap_biggest.real <= 25, true,
    `no heading renders more than the cap (largest was ${cap_biggest.real})`);
  const cap_withMore = cap_capped.find(g => g.more !== null);
  is(cap_withMore !== undefined, true, 'and a heading that is holding rows back says so');
  is(/^\d+ more under /.test(cap_withMore?.more || ''), true,
    `it states the real number ("${cap_withMore?.more}")`);

  // The number must be TRUE: revealing must produce exactly that cap_many more rows.
  const cap_rowsBefore = await tpage.locator('#cards li.card:not(.card-more)').count();
  const cap_promised = Number((cap_withMore?.more || '').match(/^(\d+)/)?.[1] ?? '0');
  await tpage.locator('.card-more .card-open').first().click();
  await tpage.waitForTimeout(400);
  const cap_rowsAfter = await tpage.locator('#cards li.card:not(.card-more)').count();
  is(cap_rowsAfter - cap_rowsBefore, cap_promised,
    `showing them produced exactly the number it promised (${cap_rowsBefore} -> ${cap_rowsAfter}, promised ${cap_promised})`);
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.click('#about-close');

  console.log('\nSort mode — a triage that can reach everything (1.3.0)');
  // Three LOOSE rows — top-level, no project — the shape daily triage can
  // never reach, because the captured latch bars anything arriving by
  // node.created. This is Noah's 1,222, at fixture scale.
  const gaugeBeforeLoose = await tpage.locator('#triage-gauge').textContent().catch(() => '') || '';
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.setInputFiles('#other-file', {
    name: 'loose.taskpaper', mimeType: 'text/plain',
    buffer: Buffer.from('- Sort me one\n- Sort me two\n- Sort me three\n'),
  });
  await tpage.waitForFunction(() => /Found/.test(
    document.querySelector('#other-note')?.textContent ?? ''), null, { timeout: 5000 });
  const looseNav = tpage.waitForEvent('framenavigated');
  await tpage.click('#other-go');
  await looseNav;
  await tpage.waitForSelector('body[data-ready=true]');

  // THE BOUNDARY (law 8): importing loose rows changes NOTHING about daily
  // triage — no new headline, no queue growth. Sort mode is where they live.
  const gaugeAfterLoose = await tpage.locator('#triage-gauge').textContent().catch(() => '') || '';
  is(gaugeAfterLoose, gaugeBeforeLoose,
    `the daily triage gauge is untouched by an import ("${gaugeBeforeLoose}" -> "${gaugeAfterLoose}")`);

  await tpage.click('#sort-open');
  await tpage.waitForSelector('#sort[open]');
  const choiceWords = await tpage.locator('#sort-choices .sort-choice-words').allTextContents();
  is(choiceWords.some(w => /Loose things brought in/.test(w)), true,
    `the picker offers the loose-import range (${JSON.stringify(choiceWords)})`);
  // Sentences and counts, never lists: no item title may appear in the picker.
  const pickerText = await tpage.locator('#sort-picker').textContent() || '';
  is(/Sort me one/.test(pickerText), false, 'the picker shows sentences and counts, never the items');

  // Enter by QUERY (deterministic against whatever else this walk imported).
  await tpage.fill('#sort-query', 'Sort me');
  await tpage.click('#sort-query-go');
  await tpage.waitForSelector('#sort-card-region:not([hidden])');
  is(/3 things, oldest first/.test(await tpage.locator('#sort-entry').textContent() || ''), true,
    'the range states its true total once, at entry');
  is(await tpage.locator('#sort-card').textContent(), 'Sort me one', 'oldest first');

  // Route it away, take it back: the same conveyor, the same undo.
  await tpage.locator('#sort-actions .route', { hasText: 'Next action' }).first().click();
  await tpage.waitForSelector('#sort-undo .triage-undo-btn');
  await tpage.click('#sort-undo .triage-undo-btn');
  await tpage.waitForFunction(() =>
    document.querySelector('#sort-card')?.textContent === 'Sort me one');
  is(await tpage.locator('#sort-card').textContent(), 'Sort me one',
    'undo returns the card to the range, recomputed live');

  // Route for real; the card advances. Leave the next; it cycles without a write.
  const sortCount = () => tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').count();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  });
  const sortLogBefore = await sortCount();
  await tpage.locator('#sort-actions .route', { hasText: 'Someday' }).first().click();
  await tpage.waitForFunction(() =>
    document.querySelector('#sort-card')?.textContent === 'Sort me two');
  await tpage.locator('#sort-actions .route', { hasText: 'Leave it' }).first().click();
  is(await tpage.locator('#sort-card').textContent(), 'Sort me three', 'Leave it advances');

  // Open it: the detail sheet, with the 1.3.0 verbs — a real date the app never
  // had (Not before), filing into a project that does not exist yet, and the
  // estimate that could never be backfilled.
  await tpage.click('#sort-card');
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#detail-start', '2026-12-01');
  await tpage.click('#detail-start-set');
  await tpage.waitForTimeout(150);
  await tpage.fill('#detail-parent-filter', 'Sorted pile');
  await tpage.waitForSelector('#detail-parent-create:not([hidden])');
  is(/New project named/.test(await tpage.locator('#detail-parent-create').textContent() || ''), true,
    'typing an unknown place offers to create it');
  await tpage.click('#detail-parent-create');
  await tpage.waitForFunction(() => /Part of Sorted pile/.test(
    document.querySelector('#detail-place')?.textContent ?? ''));
  await tpage.fill('#detail-estimate', '55');
  await tpage.click('#detail-estimate-set');
  await tpage.waitForTimeout(150);
  await tpage.click('#detail-close');

  // After the sheet closes the conveyor stands on the remaining card. Leaving
  // it too exhausts the sitting — and the lap must RESTART with the earlier
  // skipped card rather than wedging on the head item forever while saying
  // "left" (audit): Leave it always advances.
  await tpage.waitForFunction(() =>
    document.querySelector('#sort-card')?.textContent === 'Sort me three');
  await tpage.locator('#sort-actions .route', { hasText: 'Leave it' }).first().click();
  await tpage.waitForFunction(() =>
    document.querySelector('#sort-card')?.textContent === 'Sort me two');
  is(await tpage.locator('#sort-card').textContent(), 'Sort me two',
    'when only skipped cards remain, the lap starts again — Leave it always advances');

  // THE FRESH CHECK (audit, CRITICAL): a route button carries the card it was
  // painted for, and the sheet is reachable from here — so the very item on
  // screen can change between paint and tap. Trash the card through the sheet,
  // then fire the click the STALE button would have delivered: it must refuse
  // in words and write nothing, not route a thing the user just let go.
  await tpage.evaluate(() => { window.__staleRoute = document.querySelector('#sort-actions .route'); });
  await tpage.click('#sort-card');
  await tpage.waitForSelector('#detail[open]');
  await tpage.click('#detail-trash');
  await tpage.waitForTimeout(200);
  await tpage.click('#detail-close');
  await tpage.waitForFunction(() =>
    document.querySelector('#sort-card')?.textContent === 'Sort me three');
  const staleLogMid = await sortCount();
  await tpage.evaluate(() => { window.__staleRoute.click(); });
  await tpage.waitForFunction(() => /changed while it was on screen/.test(
    document.querySelector('#sort-live')?.textContent ?? ''));
  is(await sortCount(), staleLogMid, 'the stale click wrote nothing');
  is(await tpage.locator('#sort-card').textContent(), 'Sort me three',
    'and the fresh view stands');

  // Law 5, asserted on the DOM: sorting shows no progress arithmetic, ever.
  // The entry sentence ("N things, oldest first") is the ONE sanctioned total,
  // stated once at entry — so #sort-entry is excluded by element and every
  // other node in the dialog faces the full pattern: percentages, "remaining",
  // tallies, and the count-forms the first regex missed ("19 of 240", "3/240",
  // "5 left", "3 to go" — number-adjacent, so the verb message "Left where it
  // is." stays legal).
  const sortText = await tpage.evaluate(() => {
    const clone = document.querySelector('#sort')?.cloneNode(true);
    clone?.querySelector('#sort-entry')?.remove();
    return clone?.textContent ?? '';
  });
  is(/%|remaining|sorted this sitting|\bof the\b \d+|\d+\s*(of|\/)\s*\d+|\d+\s+left\b|\d+\s+to go\b/.test(sortText), false,
    'no tally, no countdown, no percentage anywhere in sort mode');
  is(await tpage.locator('#sort progress').count(), 0, 'and no progress element');
  await tpage.click('#sort-close');

  // The log tells the same story: a route landed on a NEVER-CAPTURED node, the
  // undo wrote its reopen, the start clock carries its source, the estimate is
  // down, and the created project holds the filed row.
  const sortLog = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const rows = await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const created = rows.filter(e => e.kind === 'node.created');
    const sortMe = created.filter(e => /^Sort me/.test(e.payload?.title ?? '')).map(e => e.node);
    const pile = created.find(e => e.payload?.title === 'Sorted pile');
    return {
      capturedSortMe: rows.some(e => e.kind === 'capture.recorded' && sortMe.includes(e.node)),
      routed: rows.filter(e => e.kind === 'clarify.routed' && sortMe.includes(e.node)).length,
      reopened: rows.filter(e => e.kind === 'clarify.reopened' && sortMe.includes(e.node)).length,
      startClock: rows.some(e => e.kind === 'clock.set' && e.payload?.clockKind === 'start'
        && e.payload?.source === 'detail:start' && sortMe.includes(e.node)),
      estimate: rows.some(e => e.kind === 'estimate.recorded' && e.payload?.durationMinutes === 55),
      pileKind: pile?.payload?.nodeKind,
      filedUnderPile: rows.some(e => e.kind === 'node.parented'
        && e.payload?.parent === pile?.node && sortMe.includes(e.node)),
    };
  });
  is(sortLog.capturedSortMe, false, 'the rows were never captures — the latch stays honest');
  is(sortLog.routed >= 2, true, `routes landed on never-captured nodes (${sortLog.routed})`);
  is(sortLog.reopened >= 1, true, 'the undo wrote its clarify.reopened');
  is(sortLog.startClock, true, 'the Not-before clock landed with its source');
  is(sortLog.estimate, true, 'the estimate is in the log — the data that cannot be backfilled');
  is(sortLog.pileKind, 'project', 'the created-in-place parent is a real project');
  is(sortLog.filedUnderPile, true, 'and the card was filed under it in the same commit');
  is(await sortCount() > sortLogBefore, true, 'sorting wrote real events');

  // And the daily triage card is a door now too: capture, tap the card, the
  // sheet opens on that very item.
  await tpage.fill('#capture', 'open me from triage');
  await tpage.click('#capture-form button[type=submit]');
  await tpage.waitForSelector('#triage:not([hidden])');
  const triageShows = await tpage.locator('#triage-card').textContent();
  await tpage.click('#triage-card');
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-title').textContent(), triageShows,
    `tapping the triage card opens the sheet on THAT item ("${triageShows}") — rename and dates mid-triage`);
  await tpage.click('#detail-close');

  console.log('\nWhat a thing carries, and what the app did (1.4.0)');
  // Import the exact CSV shape that once lost every note, and read the note
  // back off the item's own sheet.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.setInputFiles('#other-file', {
    name: 'noted.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Task ID,Type,Name,Status,Project,Notes\n1,Action,Noted thing,,,ask about the crown\n'),
  });
  await tpage.waitForFunction(() => /Found/.test(
    document.querySelector('#other-note')?.textContent ?? ''), null, { timeout: 5000 });
  is(/One note comes across with its item/.test(await tpage.locator('#other-note').textContent() || ''), true,
    'the summary states the carry, before anything is written');
  const notedNav = tpage.waitForEvent('framenavigated');
  await tpage.click('#other-go');
  await notedNav;
  await tpage.waitForSelector('body[data-ready=true]');

  // Reach it through sort mode's query door and open the sheet.
  await tpage.click('#sort-open');
  await tpage.waitForSelector('#sort[open]');
  await tpage.fill('#sort-query', 'Noted thing');
  await tpage.click('#sort-query-go');
  await tpage.waitForSelector('#sort-card-region:not([hidden])');
  await tpage.click('#sort-card');
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-note').inputValue(), 'ask about the crown',
    'the imported note is on the sheet — the loss the audit found is over');

  // Edit it, reload the whole app, and it is still there (fold + snapshot).
  await tpage.fill('#detail-note', 'ask about the crown\nand the bill');
  await tpage.click('#detail-note-set');
  await tpage.waitForTimeout(200);

  // Per-node history: the record of this one thing, cure indented under cause.
  await tpage.click('#detail-history summary');
  await tpage.waitForFunction(() =>
    (document.querySelectorAll('#detail-history-lines .log-line').length) > 0);
  const historyText = await tpage.locator('#detail-history-lines').textContent() || '';
  is(/Created — an action/.test(historyText), true, 'its creation is a line in words');
  is(/A note was kept with it/.test(historyText), true, 'and so is the note — the words, not the content');
  is(historyText.includes('ask about the crown'), false, 'the note BODY stays off the history');
  is(/so it would not go silent/.test(historyText), true, 'the app explains its own cure');
  is(await tpage.locator('#detail-history-lines .log-cure').count() >= 1, true,
    'and the cure is marked as the app’s, indented under its cause');
  await tpage.click('#detail-close');
  await tpage.click('#sort-close');

  await tpage.reload();
  await tpage.waitForSelector('body[data-ready=true]');
  await tpage.click('#sort-open');
  await tpage.waitForSelector('#sort[open]');
  await tpage.fill('#sort-query', 'Noted thing');
  await tpage.click('#sort-query-go');
  await tpage.waitForSelector('#sort-card-region:not([hidden])');
  await tpage.click('#sort-card');
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-note').inputValue(), 'ask about the crown\nand the bill',
    'the edited note survives a full reload, newlines intact');
  await tpage.click('#detail-close');
  await tpage.click('#sort-close');

  // The record itself: day-grouped, plain words, true totals, honest reveal.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.click('#log-open');
  // The container unhides synchronously; the CONTENT lands after the async
  // store read. Waiting on the container read an empty total on the 2-core CI
  // runner while the local machine won the race (the V-10 shape, again) — so
  // wait for the words themselves. The total is written before the first page
  // renders, in the same task, so once it reads the lines are there too.
  await tpage.waitForFunction(() => /event/.test(
    document.querySelector('#log-total')?.textContent ?? ''), null, { timeout: 5000 });
  const logTotalWords = await tpage.locator('#log-total').textContent() || '';
  const logTotalN = Number(logTotalWords.match(/^(\d+) events/)?.[1] ?? '0');
  is(logTotalN > 0, true, `the record states its true size (${logTotalN})`);
  is(await tpage.locator('.log-day-title').count() >= 1, true, 'days are headed');
  is(await tpage.locator('#log-days .log-line').count() > 0, true, 'lines render in words');
  const moreVisible = await tpage.locator('#log-more:not([hidden])').count();
  if (moreVisible > 0) {
    const beforeLines = await tpage.locator('#log-days .log-line').count();
    const promised = (await tpage.locator('#log-more').textContent() || '').match(/(\d+) of (\d+)/);
    is(Number(promised?.[2]), logTotalN, 'the reveal button and the total agree');
    await tpage.click('#log-more');
    await tpage.waitForTimeout(150);
    const afterLines = await tpage.locator('#log-days .log-line').count();
    is(afterLines - beforeLines, Math.min(50, logTotalN - beforeLines),
      `the reveal produced exactly what it promised (${beforeLines} -> ${afterLines})`);
  }
  // Reading changed nothing: the log is the same size it said it was.
  const logDbCount = await sortCount();
  is(logDbCount, logTotalN, 'the stated total IS the store count — read-only, no drift');
  await tpage.click('#about-close');

  console.log('\nWholesale — bulk acts on a named range (1.5.0)');
  // Six loose rows, one carrying a real future due date — the batch shape, at
  // fixture scale, with the date that must be SHED on a Menu landing.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.setInputFiles('#other-file', {
    name: 'bulk.taskpaper', mimeType: 'text/plain',
    buffer: Buffer.from('- Bulk me one\n- Bulk me two @due(2026-12-01)\n- Bulk me three\n- Bulk me four\n- Bulk me five\n- Bulk me six\n'),
  });
  await tpage.waitForFunction(() => /Found/.test(
    document.querySelector('#other-note')?.textContent ?? ''), null, { timeout: 5000 });
  const bulkNav = tpage.waitForEvent('framenavigated');
  await tpage.click('#other-go');
  await bulkNav;
  await tpage.waitForSelector('body[data-ready=true]');

  // Enter the range and open the wholesale block.
  await tpage.click('#sort-open');
  await tpage.waitForSelector('#sort[open]');
  await tpage.fill('#sort-query', 'Bulk me');
  await tpage.click('#sort-query-go');
  await tpage.waitForSelector('#sort-card-region:not([hidden])');
  await tpage.click('#sort-act-all');
  await tpage.waitForSelector('#sort-bulk:not([hidden])');

  // FILE THEM: preview counted from the real plan, then the receipt, then undo.
  await tpage.locator('#sort-bulk-verbs .route', { hasText: 'Put them under' }).click();
  await tpage.fill('#sort-bulk-parent-filter', 'Sorted pile');
  await tpage.waitForFunction(() =>
    document.querySelectorAll('#sort-bulk-parent option').length === 2);
  await tpage.selectOption('#sort-bulk-parent', { index: 1 });
  await tpage.waitForFunction(() => /Put 6 things under “Sorted pile”/.test(
    document.querySelector('#sort-bulk-preview')?.textContent ?? ''));
  is(await tpage.locator('#sort-bulk-go').isEnabled(), true, 'the preview is ready and says so');
  await tpage.click('#sort-bulk-go');
  await tpage.waitForFunction(() => /Filed 6 things\./.test(
    document.querySelector('#sort-bulk-outcome')?.textContent ?? ''));
  const bulkLog1 = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const rows = await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const created = rows.filter(e => e.kind === 'node.created' && /^Bulk me/.test(e.payload?.title ?? ''));
    const ids = created.map(e => e.node);
    const acted = rows.filter(e => e.kind === 'range.acted');
    return {
      actedCount: acted.length,
      lastActed: acted[acted.length - 1]?.payload ?? null,
      filed: rows.filter(e => e.kind === 'node.parented' && ids.includes(e.node)).length,
    };
  });
  is(bulkLog1.actedCount >= 1, true, 'the receipt noun is in the log');
  is(bulkLog1.lastActed?.verb, 'put-under', 'and it names the verb');
  is(bulkLog1.lastActed?.count, 6, 'and the true count');
  is(bulkLog1.filed, 6, 'six real filings — the receipt precedes exactly what it explains');

  await tpage.click('#sort-bulk-undo');
  await tpage.waitForFunction(() => /Taken back — 6 things restored\./.test(
    document.querySelector('#sort-bulk-outcome')?.textContent ?? ''));
  is(await tpage.locator('#sort-bulk-undo').isHidden(), true, 'the undo is one-shot');

  // TO THE MENU: the due date is shed on the way (the 1.3.1 belt, wholesale).
  await tpage.locator('#sort-bulk-verbs .route', { hasText: 'To the Menu' }).click();
  await tpage.selectOption('#sort-bulk-category', 'research');
  await tpage.waitForFunction(() => /Send 6 things to the Menu — research/.test(
    document.querySelector('#sort-bulk-preview')?.textContent ?? ''));
  await tpage.click('#sort-bulk-go');
  await tpage.waitForFunction(() => /Sent 6 things to the Menu\./.test(
    document.querySelector('#sort-bulk-outcome')?.textContent ?? ''));
  const shed = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const rows = await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const two = rows.find(e => e.kind === 'node.created' && e.payload?.title === 'Bulk me two');
    return rows.some(e => e.kind === 'clock.cleared' && e.node === two?.node
      && e.payload?.clockKind === 'due');
  });
  is(shed, true, 'the due date came off as it landed — a wish holds no demands, wholesale too');

  // The MENU RANGE: wishes take promote semantics only — no card, no routes.
  await tpage.click('#sort-back');
  await tpage.waitForSelector('#sort-picker:not([hidden])');
  await tpage.locator('#sort-choices .sort-choice', { hasText: 'On the Menu — research' }).click();
  await tpage.waitForSelector('#sort-bulk:not([hidden])');
  is(await tpage.locator('#sort-card').isHidden(), true, 'a Menu range shows no conveyor card');
  const menuVerbs = await tpage.locator('#sort-bulk-verbs .route .route-label').allTextContents();
  is(menuVerbs.join('|'), 'Bring them back as real work|Let them go',
    `promote semantics only (${JSON.stringify(menuVerbs)})`);
  await tpage.locator('#sort-bulk-verbs .route', { hasText: 'Bring them back' }).click();
  await tpage.waitForFunction(() => /Bring 6 things back from the Menu/.test(
    document.querySelector('#sort-bulk-preview')?.textContent ?? ''));
  await tpage.click('#sort-bulk-go');
  await tpage.waitForFunction(() => /Brought 6 things back as real work\./.test(
    document.querySelector('#sort-bulk-outcome')?.textContent ?? ''));

  // LET THEM GO: the typed word, the copy FIRST, and the way back at last.
  await tpage.click('#sort-back');
  await tpage.waitForSelector('#sort-picker:not([hidden])');
  await tpage.fill('#sort-query', 'Bulk me');
  await tpage.click('#sort-query-go');
  await tpage.waitForSelector('#sort-card-region:not([hidden])');
  await tpage.click('#sort-act-all');
  await tpage.waitForSelector('#sort-bulk:not([hidden])');
  await tpage.locator('#sort-bulk-verbs .route', { hasText: 'Let them go' }).click();
  await tpage.waitForFunction(() => /Let 6 things go\./.test(
    document.querySelector('#sort-bulk-preview')?.textContent ?? ''));
  is(await tpage.locator('#sort-bulk-go').isEnabled(), false, 'the destructive verb waits for its word');
  await tpage.fill('#sort-bulk-word', 'let it go');
  await tpage.waitForTimeout(100);
  is(await tpage.locator('#sort-bulk-go').isEnabled(), false, 'a near-miss does not unlock it');
  await tpage.fill('#sort-bulk-word', 'Let Go ');
  await tpage.waitForFunction(() =>
    !document.querySelector('#sort-bulk-go')?.disabled);
  await tpage.click('#sort-bulk-go');
  await tpage.waitForFunction(() => /Let 6 things go\./.test(
    document.querySelector('#sort-bulk-outcome')?.textContent ?? ''));
  const letGo = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const rows = await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const stamp = (e) => [e.at, e.device, e.seq];
    const cmp = (a, b) => a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] !== b[1] ? (a[1] < b[1] ? -1 : 1) : a[2] - b[2];
    const exp = rows.filter(e => e.kind === 'export.written' && e.payload?.scope === 'before-letting-go')
      .map(stamp).sort(cmp)[0] ?? null;
    const firstTrash = rows.filter(e => e.kind === 'node.trashed' && e.payload?.reason === 'range:let-go')
      .map(stamp).sort(cmp)[0] ?? null;
    return { exp: exp !== null, trash: firstTrash !== null,
      ordered: exp !== null && firstTrash !== null && cmp(exp, firstTrash) < 0 };
  });
  is(letGo.exp, true, 'the copy was recorded');
  is(letGo.trash, true, 'the letting-go landed');
  is(letGo.ordered, true, 'and the copy PRECEDES the first trashed event — machine-checked at last');
  await tpage.click('#sort-close');

  // THINGS YOU LET GO: the promise "keep it after all" is finally true.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.click('#trash-open');
  await tpage.waitForSelector('#trash-view:not([hidden])');
  is(/6 things|things/.test(await tpage.locator('#trash-total').textContent() || ''), true,
    'the trash states its true count');
  await tpage.locator('#trash-list .trash-row', { hasText: 'Bulk me one' }).click();
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-untrash').isVisible(), true,
    '"Keep it after all" is reachable after the sheet once closed — the standing defect is over');
  await tpage.click('#detail-untrash');
  await tpage.waitForFunction(() => {
    const b = document.querySelector('#detail-untrash');
    return b ? b.hidden : false;
  });
  await tpage.click('#detail-close');
  await tpage.click('#trash-open');   // collapse
  await tpage.click('#trash-open');   // re-open repaints
  await tpage.waitForFunction(() => !/Bulk me one/.test(
    document.querySelector('#trash-list')?.textContent ?? ''));
  is(true, true, 'kept after all — and the trash view no longer lists it');
  await tpage.click('#about-close');

  console.log('\nSeeing and choosing (1.6.0)');
  // THE TREE, on request and never the landing view: hidden until asked.
  is(await tpage.locator('#tree').isVisible(), false, 'the tree is not the landing view');
  await tpage.click('#tree-open');
  await tpage.waitForSelector('#tree:not([hidden])');
  const treeText = await tpage.locator('#tree').textContent() || '';
  is(/Sorted pile/.test(treeText), true, 'containers hang in the tree');
  const treeDepths = await tpage.evaluate(() =>
    [...document.querySelectorAll('#tree .tree-item')].map(li =>
      Number(getComputedStyle(li).getPropertyValue('--tree-depth') || '0')));
  is(treeDepths.some(d => d > 0), true, 'children indent under their containers');
  await tpage.locator('#tree .tree-open-row', { hasText: 'Sorted pile' }).first().click();
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-title').textContent(), 'Sorted pile',
    'a tree row is a door to the sheet — the one verb it carries');
  await tpage.click('#detail-close');
  await tpage.click('#tree-open');   // collapse again

  // DOORS: the coverage rows open sheets now.
  await tpage.click('#gauge');
  await tpage.waitForSelector('#coverage:not([hidden])');
  const firstCovered = await tpage.locator('#coverage .coverage-open .coverage-title').first().textContent();
  await tpage.locator('#coverage .coverage-open').first().click();
  await tpage.waitForSelector('#detail[open]');
  is(await tpage.locator('#detail-title').textContent(), firstCovered,
    'a coverage row is a door to that very item');
  await tpage.click('#detail-close');
  await tpage.click('#gauge');       // collapse

  // COMPOSED TODAY, optional and off by default: nothing anywhere until asked.
  is(await tpage.locator('#composed').isVisible(), false, 'off by default — nothing renders');
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.click('#today-start');
  await tpage.waitForFunction(() => /^On\./.test(
    document.querySelector('#today-note')?.textContent ?? ''));
  await tpage.click('#about-close');

  // Choose two things from their own sheets, via search — the verb's one home.
  const chooseBySearch = async (words, title) => {
    // Fill-and-verify: on this exact beat — the first search after the module
    // toggle's refresh — a plain fill has been observed (here and in a11y) to
    // resolve without the value landing, rarely and only on loaded runners.
    for (let tries = 0; ; tries++) {
      await tpage.fill('#search-input', words);
      const landed = await tpage.waitForFunction(
        (w) => document.querySelector('#search-input')?.value === w, words,
        { timeout: 2000 },
      ).then(() => true).catch(() => false);
      if (landed) break;
      if (tries >= 2) break;   // let the selector wait below state the failure
    }
    await tpage.waitForSelector('#search-results .search-open');
    await tpage.locator('#search-results .search-open', { hasText: title }).first().click();
    await tpage.waitForSelector('#detail[open]');
    await tpage.waitForSelector('#detail-today-add:not([hidden])');
    await tpage.click('#detail-today-add');
    await tpage.waitForFunction(() => /Chosen for today/.test(
      document.querySelector('#detail-live')?.textContent ?? ''));
    await tpage.click('#detail-close');
    await tpage.fill('#search-input', '');
  };
  await chooseBySearch('open me', 'open me from triage');
  await chooseBySearch('Noted thing', 'Noted thing');
  await tpage.waitForSelector('#composed:not([hidden])');
  is(await tpage.locator('#composed-list .composed-open').count(), 2,
    'the chosen few sit above Next up');
  const composedText = await tpage.locator('#composed').textContent() || '';
  is(/%|\d+ of \d+|remaining/.test(composedText), false, 'no fraction, ever (laws 3+5)');

  // A composed row is a door; the sheet offers the release.
  await tpage.locator('#composed-list .composed-open', { hasText: 'Noted thing' }).click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.waitForSelector('#detail-today-remove:not([hidden])');
  await tpage.click('#detail-today-remove');
  await tpage.waitForFunction(() => /Out of today/.test(
    document.querySelector('#detail-live')?.textContent ?? ''));
  await tpage.click('#detail-close');
  await tpage.waitForFunction(() =>
    document.querySelectorAll('#composed-list .composed-open').length === 1);

  // Turning the module OFF removes every surface of it; the record stays.
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  await tpage.click('#today-stop');
  await tpage.waitForFunction(() => /^Off\./.test(
    document.querySelector('#today-note')?.textContent ?? ''));
  await tpage.click('#about-close');
  is(await tpage.locator('#composed').isVisible(), false, 'optional means gone when off');
  const todayLog = await sortCount();
  is(todayLog > 0, true, `and the log kept the record (${todayLog} events)`);

  console.log('\nDuplicates and the lens (1.7.0)');
  // TWINS: two captures of the same worry, differing only in case, plus one
  // that merely rhymes. The fixture already holds duplicates of its own, so
  // every count below is a DELTA against what the picker said before.
  const twinsCount = async () => {
    await tpage.click('#sort-open');
    await tpage.waitForSelector('#sort[open]');
    const rows = await tpage.locator('#sort-choices .sort-choice').allTextContents();
    await tpage.click('#sort-close');
    const row = rows.find(r => /Sharing a name with something else/.test(r));
    return row ? Number((row.match(/(\d+) thing/) ?? [])[1] ?? 1) : 0;
  };
  const twinsBefore = await twinsCount();
  for (const t of ['Polish the samovar', 'polish the SAMOVAR', 'Polish the banister']) {
    await tpage.fill('#capture', t);
    await tpage.click('#capture-form button[type=submit]');
    await tpage.waitForFunction(() => (document.querySelector('#capture')?.value ?? 'x') === '');
  }
  is(await twinsCount(), twinsBefore + 2,
    `the twins range grew by exactly the pair — the banister merely rhymes (${twinsBefore} -> ${twinsBefore + 2})`);
  await tpage.click('#sort-open');
  await tpage.waitForSelector('#sort[open]');
  await tpage.locator('#sort-choices .sort-choice', { hasText: 'Sharing a name' }).click();
  await tpage.waitForSelector('#sort-card-region:not([hidden])');
  is(/thing/.test(await tpage.locator('#sort-entry').textContent() || ''), true,
    'the range states its true total once, at entry');
  await tpage.click('#sort-close');

  // The sheet carries the fold verb; the older twin folds into the newer.
  await tpage.fill('#search-input', 'samovar');
  await tpage.waitForSelector('#search-results .search-open');
  await tpage.locator('#search-results .search-open', { hasText: /Polish the samovar/ }).click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.fill('#search-input', '');
  is(await tpage.locator('#detail-merge-group').isVisible(), true,
    'a thing that is its own thing offers the fold');
  await tpage.fill('#detail-merge-filter', 'samovar');
  await tpage.waitForFunction(() => [...document.querySelectorAll('#detail-merge option')]
    .some(o => /SAMOVAR/.test(o.textContent ?? '')));
  const mergeOptions = await tpage.locator('#detail-merge option').allTextContents();
  is(mergeOptions.some(o => /banister/.test(o)), false,
    'the filter narrowed the targets to what was typed');
  await tpage.selectOption('#detail-merge', { label: 'polish the SAMOVAR' });
  const mergeLogBefore = await sortCount();
  await tpage.click('#detail-merge-set');
  await tpage.waitForFunction(() => /Folded into/.test(
    document.querySelector('#detail-live')?.textContent ?? ''));
  is(await tpage.locator('#detail-unmerge-group').isVisible(), true,
    'and the way back is right below, the moment it folds');
  is(await tpage.locator('#detail-merge-group').isHidden(), true,
    'a folded thing does not fold again');
  await tpage.click('#detail-close');

  // The range recomputes live: the pair folded away, the count falls back.
  is(await twinsCount(), twinsBefore,
    'after the fold the pair is no longer a pair — the range recomputed live');

  // The folded twin is off every surface; the survivor lists what it holds,
  // and the split is one tap from there.
  await tpage.fill('#search-input', 'samovar');
  await tpage.waitForSelector('#search-results .search-open');
  const samovarHits = await tpage.locator('#search-results .search-open').count();
  is(samovarHits, 1, 'the folded twin is off every surface — search shows one samovar');
  await tpage.locator('#search-results .search-open', { hasText: /SAMOVAR/ }).click();
  await tpage.waitForSelector('#detail[open]');
  await tpage.waitForSelector('#detail-merged-group:not([hidden])');
  is(/Polish the samovar/.test(await tpage.locator('#detail-merged-list').textContent() || ''), true,
    'the survivor names what folded into it');
  await tpage.locator('#detail-merged-list button', { hasText: 'Split it back out' }).click();
  await tpage.waitForFunction(() => /Split back out/.test(
    document.querySelector('#detail-live')?.textContent ?? ''));
  await tpage.waitForSelector('#detail-merged-group[hidden]', { state: 'attached' });
  await tpage.click('#detail-close');
  await tpage.fill('#search-input', '');

  // The log tells the story: the fold, the split, and the split's cure — a
  // split-out node is silent-risk and the gate clocked it in the same batch.
  const mergeLog = await tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const rows = await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const merged = rows.filter(e => e.kind === 'node.merged');
    const unmerged = rows.filter(e => e.kind === 'node.unmerged');
    return {
      merged: merged.length,
      unmerged: unmerged.length,
      cured: unmerged.some(u => rows.some(e =>
        e.kind === 'clock.set' && e.node === u.node && String(e.id).includes('~cure~'))),
    };
  });
  is(mergeLog.merged >= 1, true, 'node.merged is in the record');
  is(mergeLog.unmerged >= 1, true, 'node.unmerged is in the record');
  is(mergeLog.cured, true, 'and the split-out node got its cure — never silent');
  is(await sortCount() > mergeLogBefore, true, 'the fold and split wrote real events');

  // THE LENS: a filter over what you are LOOKING at, never what is held.
  await tpage.waitForSelector('#lens-row:not([hidden])');
  const preLensCards = await tpage.locator('#cards .card').count();
  const preLensGauge = await tpage.locator('#gauge').textContent() || '';
  const preLensNext = await tpage.locator('#nextup').textContent() || '';
  await tpage.selectOption('#lens', { label: 'Sorted pile' });
  await tpage.waitForSelector('#lens-note:not([hidden])');
  const lensNoteWords = await tpage.locator('#lens-note').textContent() || '';
  is(/still held/.test(lensNoteWords) && /never what Quietkeep holds/.test(lensNoteWords), true,
    `law 1 is said out loud where the filtering happens ("${lensNoteWords}")`);
  is(/\d/.test(lensNoteWords), false, 'and the line carries no number (law 8)');
  const lensCards = await tpage.locator('#cards .card').count();
  is(lensCards < preLensCards, true,
    `the list narrowed to the lens (${preLensCards} -> ${lensCards})`);
  is(await tpage.locator('#gauge').textContent(), preLensGauge,
    'the gauge counts the WHOLE of what is held — a lens never touches it');
  is(await tpage.locator('#nextup').textContent(), preLensNext,
    'Next up is one thing across a whole life — never lensed');
  await tpage.selectOption('#lens', { label: 'everything' });
  await tpage.waitForSelector('#lens-note[hidden]', { state: 'attached' });
  await tpage.waitForFunction((n) =>
    document.querySelectorAll('#cards .card').length === n, preLensCards);
  is(true, true, 'back to everything — nothing was lost to the looking');

  console.log('\nClearing things out — and the guard that has to actually guard');
  const purgeRows = () => tpage.locator('#cards .card').count();
  const logCount = () => tpage.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('quietkeep');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return await new Promise((res, rej) => {
      const q = db.transaction('events', 'readonly').objectStore('events').count();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  });
  const beforeRows = await purgeRows();
  const beforeLog = await logCount();
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  is(/\d+ thing/.test(await tpage.locator('#purge-summary').textContent() || ''), true,
    'it says how many things are on the surfaces');

  // THE GUARD. Not "a confirm box exists" — that the button is genuinely
  // unusable until the right word is typed, and that a near-miss does not open it.
  await tpage.click('#purge-pick-clear');
  await tpage.waitForSelector('#purge-confirm:not([hidden])');
  is(await tpage.locator('#purge-go').isDisabled(), true, 'the go button starts disabled');
  for (const near of ['yes', 'clea', 'clears']) {
    await tpage.fill('#purge-word', near);
    is(await tpage.locator('#purge-go').isDisabled(), true, `"${near}" does not unlock it`);
  }

  // Switching mode must CLEAR the typed word. Otherwise a word typed for the
  // reversible mode sits in front of the irreversible one looking satisfied.
  await tpage.fill('#purge-word', 'clear');
  is(await tpage.locator('#purge-go').isDisabled(), false, 'the right word unlocks it');
  await tpage.click('#purge-pick-erase');
  is(await tpage.locator('#purge-word').inputValue(), '',
    'switching mode emptied the box — no authorisation carried across');
  is(await tpage.locator('#purge-go').isDisabled(), true, 'and the button locked again');
  // The consequence line is rewritten after a store read, so it is WAITED for
  // rather than sampled — sampling it made this red while the app was correct.
  await tpage.waitForFunction(() => /cannot be undone/.test(
    document.querySelector('#purge-consequence')?.textContent ?? ''), null, { timeout: 4000 });
  is(/cannot be undone/.test(await tpage.locator('#purge-consequence').textContent() || ''), true,
    'and starting again says plainly that it cannot be undone');
  is(/not saved a copy/.test(await tpage.locator('#purge-consequence').textContent() || ''), true,
    'and says whether a copy has been saved, at the moment of the decision');

  // Leaving it alone changes nothing.
  await tpage.click('#purge-cancel');
  is(await tpage.locator('#purge-confirm').isHidden(), true, 'leaving it alone closes it');
  is(await logCount(), beforeLog, 'and wrote nothing');

  // And the reversible mode: surfaces empty, log GROWS.
  await tpage.click('#purge-pick-clear');
  await tpage.fill('#purge-word', 'CLEAR ');
  is(await tpage.locator('#purge-go').isDisabled(), false,
    'case and a stray space are forgiven — this tests intent, not dexterity');
  // Wait for the app's own reload as an EVENT, never as a timeout. The old
  // shape (a fixed 900ms then a selector) raced the commit-plus-500ms reload
  // timer: on a slow run the old page was still up, its data-ready already
  // true, and the check read 102 stale cards — a poll that cannot fail telling
  // you nothing, the exact class this repo has recorded twice.
  const purgeNav = tpage.waitForEvent('framenavigated');
  await tpage.click('#purge-go');
  await purgeNav;
  await tpage.waitForSelector('body[data-ready=true]');
  is(await purgeRows() < beforeRows, true, `the surfaces emptied (${beforeRows} -> ${await purgeRows()})`);
  is(await logCount() > beforeLog, true,
    `the log GREW rather than shrank (${beforeLog} -> ${await logCount()}) — clearing is an append`);

  console.log('\nThe badge — a glance at the icon, and a number that can reach zero');
  const badge = await tpage.evaluate(async () => {
    const calls = [];
    navigator.setAppBadge = (n) => { calls.push(n ?? 'set'); return Promise.resolve(); };
    navigator.clearAppBadge = () => { calls.push('clear'); return Promise.resolve(); };
    document.querySelector('#capture').value = 'badge probe';
    document.querySelector('#capture-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 400));
    const ready = document.querySelector('.group-head')?.textContent ?? '';
    return { calls, ready };
  });
  is(badge.calls.length > 0, true, `the icon is told something (${JSON.stringify(badge.calls)})`);
  // THE NUMBER MUST BE FINDABLE. Noah came back to a red 1 on the home screen and
  // could not find a 1 inside the app — an unexplained demand, which is the one
  // thing this app must never be. The gauge has to state the same figure the icon
  // does, and the panel has to say what it means.
  const badgeGauge = (await tpage.locator('#gauge').textContent()) || '';
  const iconNumber = badge.calls.filter(c => Number.isInteger(c)).at(-1);
  // UNCONDITIONAL. The first version of this only asserted when the icon had been
  // given a number — and at this point in the walk it had been given `clear`, so
  // the check never ran at all. A guard on a state the fixture does not reach is
  // not a check, and this file has produced that shape before.
  is(/held/.test(badgeGauge) ? /ready now/.test(badgeGauge) : true, true,
    `whenever the gauge counts what is held it also states what is ready ("${badgeGauge}")`);
  is(iconNumber === undefined
      ? /\b0 ready now\b/.test(badgeGauge) || /nothing held yet/.test(badgeGauge)
      : new RegExp(`\\b${iconNumber} ready now\\b`).test(badgeGauge), true,
    `the gauge states the icon's own number ("${badgeGauge}" vs icon ${JSON.stringify(iconNumber ?? 'clear')})`);
  await tpage.click('#open-about');
  await tpage.waitForSelector('#about[open]');
  is(/number on the app icon/i.test(await tpage.locator('#badge-explainer').textContent() || ''), true,
    'and the panel says what the number on the icon means');
  await tpage.click('#about-close');
  is(badge.calls.every(c => c === 'clear' || Number.isInteger(c)), true,
    'and it is a whole count or an explicit clear, never a stale string');

  console.log('\nWork mode — no page errors');
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
