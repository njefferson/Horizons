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
  await tpage.locator('.donow button.ghost').click();            // Start two minutes
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
  const todayKey = await tpage.evaluate(() => new Date().toISOString().slice(0, 10));
  is(typeof minAttr === 'string' && minAttr >= todayKey, true,
    `a new date cannot be in the past (min="${minAttr}")`);

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
  const sixDays = await tpage.evaluate(() => new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10));
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

  await tpage.reload({ waitUntil: 'load' });
  await tpage.waitForSelector('body[data-ready=true]');
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

  // --- Two devices (ADR-0035) ----------------------------------------------
  // A SECOND browser context: its own IndexedDB, its own device id, its own
  // captures. Anything less would be testing the function, not the feature —
  // the whole point is that two stores that have never met converge.
  console.log('\nTwo devices — carrying your work from one to the other');
  const otherCtx = await browser.newContext({ timezoneId: 'America/Denver', locale: 'en-US', acceptDownloads: true });
  const other = await otherCtx.newPage();
  await other.goto(url, { waitUntil: 'load' });
  await other.waitForSelector('body[data-ready=true]');
  await other.click('#about-dismiss');
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
