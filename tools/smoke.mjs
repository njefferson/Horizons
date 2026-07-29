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
  // With the surface gone, focus returns to the capture line, not <body>.
  is(await tpage.evaluate(() => document.activeElement?.id), 'capture',
    'clearing the inbox returns focus to capture, never to <body>');

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
  is(logAfterDone.filter(k => k === 'done.marked').length, 1, 'exactly one done.marked was appended');
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
  is(headings.every(h => /^(Not sorted yet|Ready now|Coming up|Later|On the Menu|Done)$/.test(h)), true,
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

  console.log('\nThe calendar — the tier that reminds you when the app is shut');
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
  for (let i = 0; i < 40 && (await countCalExports()) < 1; i++) await tpage.waitForTimeout(50);
  await tpage.waitForTimeout(200);           // and give a duplicate time to appear
  is(await countCalExports(), 1, 'the hand-off is recorded exactly once');
  // ORDERING, which the count alone can never see: the file must exist BEFORE the
  // event claiming it left. Moving the commit above the download passed the old
  // check (audit) — this reads the surface's own confirmation, which is only
  // written after both.
  is((await tpage.locator('#calendar-note').textContent())?.startsWith('Sent.'), true,
    'and the surface confirms only after the file was handed over');
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
