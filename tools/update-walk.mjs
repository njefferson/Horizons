// A REAL second worker, and what the reader does about it (Doctrine §7h).
//
//   node tools/update-walk.mjs
//
// WHY THIS EXISTS SEPARATELY FROM THE UNIT TESTS. `test/update.test.ts` asserts
// two things: that `public/sw.js` contains no `skipWaiting()` inside `install`,
// and that `updateIsReady` decides correctly given plain objects. Both are worth
// having and NEITHER proves the behaviour. Reading source is not running it, and
// a hand-made registration object is a thing this repo wrote — it will agree
// with whatever this repo believes.
//
// §7h says so in its own words: *"Test it with a REAL second worker, not a
// mocked registration. Serve a genuinely different `sw.js` and let the browser's
// own update machinery run; a mock proves the mock works."* ADR-0072 shipped
// 1.18.1 to production with this explicitly recorded as NOT done. This is it.
//
// WHAT IT DRIVES. The browser starts an update only when the bytes at `/sw.js`
// change, so the server serves a genuinely different worker on the second fetch
// — a real file, with a real different cache name, installed by Chromium's own
// machinery on its own schedule. Nothing here simulates a registration.
//
// THE FOUR CLAIMS, which are the whole of §7h.1 and .2:
//   1. the new worker reaches `waiting` and STOPS there
//   2. it does NOT become the controller on its own — no `controllerchange`
//   3. the reader is told, in words they can see
//   4. and the reader's press is what promotes it, all the way to a page
//      running the new build
//
// Claim 2 is the one the old code failed, silently, from the first release.
//
// EXITS NON-ZERO on any failure.

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
  actual === expected ? ok(`${what}: ${actual}`)
    : bad(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

// The second worker. A real file, differing from the shipped one only in its
// cache name — which is the one thing that must change between releases
// (LESSONS §21), and is what makes "which build is this device holding"
// answerable at all.
const NEXT = 'quietkeep-99.0.0';
const realSw = readFileSync(`${ROOT}/sw.js`, 'utf8');
const nextSw = realSw.replace(/quietkeep-[\d.]+/g, NEXT);
if (nextSw === realSw) {
  console.error('could not build a different worker — the cache name did not match.');
  process.exit(1);
}

const { server, url, overrides } = await serve(ROOT);
const browser = await chromium.launch(launchOpts);

console.log('=== a real second worker · Doctrine §7h ===\n');

try {
  const ctx = await browser.newContext({ timezoneId: 'America/Denver', locale: 'en-US' });
  const page = await ctx.newPage();

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready=true]');
  await page.click('#tour-skip').catch(() => {});

  // The first load races the very first registration, so wait for this page to
  // actually be under a worker before calling anything about it an update.
  // `clients.claim()` in activate is what makes this arrive without a reload.
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 15000 });
  is(await page.evaluate(() => navigator.serviceWorker.controller != null), true,
    'a worker controls the page before anything is asked of it');
  is(await page.evaluate(async () => (await caches.keys()).find(k => k.startsWith('quietkeep')) ?? null),
    `quietkeep-${CURRENT.triplet}`,
    'and the cache it built carries the running release');

  // Watch for a takeover we did not ask for. This flag IS claim 2, and it is
  // the assertion the shipped-for-eighteen-releases behaviour would fail.
  await page.evaluate(() => {
    globalThis.__swTookOver = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { globalThis.__swTookOver = true; });
  });

  // --- serve a genuinely different worker ------------------------------------
  overrides.set('/sw.js', nextSw);
  overrides.set('/./sw.js', nextSw);

  // The browser's own machinery from here. `update()` asks it to re-fetch; what
  // it does with the new bytes is Chromium's decision, not ours.
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });

  // Polled from Node rather than with `waitForFunction`, whose predicate here
  // returned a Promise — always truthy on the first poll, so the wait resolved
  // instantly and the assertion fired before the worker had finished
  // installing. It read as a product failure and was a harness one; the swallowed
  // `.catch` hid the difference. (LESSONS §24 — a failing test can mean the
  // expectation, or the instrument, was wrong.)
  const waitingNow = async () =>
    page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null);
  for (let i = 0; i < 60 && !(await waitingNow()); i++) await page.waitForTimeout(500);

  is(await waitingNow(), true, '1. the new worker installed and is WAITING');

  // Give it room to misbehave before believing it did not. A takeover that
  // happens 200ms after the assertion is still a takeover.
  await page.waitForTimeout(1500);
  is(await page.evaluate(() => globalThis.__swTookOver), false,
    '2. and it did NOT take over on its own — no controllerchange');
  is(await page.evaluate(() => navigator.serviceWorker.controller != null), true,
    '   the page is still under the OLD worker, which is the point');

  // --- the reader is told ----------------------------------------------------
  await page.waitForSelector('#update:not([hidden])', { timeout: 10000 }).catch(() => {});
  is(await page.evaluate(() => document.querySelector('#update')?.checkVisibility() === true), true,
    '3. the reader is told, on a surface they can see');
  const words = await page.evaluate(() => document.querySelector('#update-words')?.textContent ?? '');
  is(/newer version is ready/i.test(words), true, '   in words that say a version is ready');
  is(/waits until you say so|keeps working/i.test(words), true,
    '   and that say nothing moves until they choose');

  // Every interrupting surface carries its way out (§4), and this one is not
  // conditional on accepting anything.
  is(await page.evaluate(() => document.querySelector('#update-dismiss')?.checkVisibility() === true), true,
    '   with a way out that does not require accepting it');

  // --- and the reader's press is what promotes it ---------------------------
  const cachesBefore = await page.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('quietkeep')));
  is(cachesBefore.includes(NEXT), true,
    '   the new build is downloaded and held, waiting rather than serving');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => {}),
    page.click('#update-reload'),
  ]);
  await page.waitForSelector('body[data-ready=true]', { timeout: 15000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 15000 });

  const after = await page.evaluate(async () => ({
    caches: (await caches.keys()).filter(k => k.startsWith('quietkeep')),
    waiting: (await navigator.serviceWorker.getRegistration())?.waiting != null,
  }));
  is(after.caches.includes(NEXT), true, '4. after the press, the device is running the new build');
  is(after.caches.length, 1, '   and the old cache was swept, so nothing is left half-updated');
  is(after.waiting, false, '   with nothing left waiting');

  // A newcomer is never told (§7h.3) — asserted on a genuinely fresh profile,
  // because "no controller yet" is a state only a first-ever visit has.
  const fresh = await browser.newContext({ timezoneId: 'America/Denver', locale: 'en-US' });
  const p2 = await fresh.newPage();
  await p2.goto(url, { waitUntil: 'load' });
  await p2.waitForSelector('body[data-ready=true]');
  await p2.waitForTimeout(1200);
  is(await p2.evaluate(() => document.querySelector('#update')?.checkVisibility() === true), false,
    '5. a first-ever visitor is never told an update is ready (§7h.3)');
  await fresh.close();
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} failure(s). Doctrine §7h: the reader decides when the app changes.`);
  process.exit(1);
}
console.log('A real second worker waits, says so, and lands only when the reader says.');
