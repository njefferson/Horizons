import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';
const launchOpts = { args: ['--no-sandbox'] };
const SB = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
if (existsSync(SB)) launchOpts.executablePath = SB;
const { server, url } = await serve('/home/user/Horizons/public');
const browser = await chromium.launch(launchOpts);
const countKind = (page, kind) => page.evaluate(async (k) => {
  const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
  return await new Promise((res) => {
    const tx = db.transaction('events','readonly').objectStore('events').getAll();
    tx.onsuccess = () => res(tx.result.filter(e => e.kind === k).length);
  });
}, kind);
async function fresh() {
  const ctx = await browser.newContext({ timezoneId: 'America/Denver', locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready=true]');
  await page.click('#about-close');
  await page.waitForSelector('body[data-intro-dismissed=true]');
  return { ctx, page };
}
async function routed(page, text) {
  await page.fill('#capture', text);
  await page.click('#capture-form button[type=submit]');
  await page.waitForSelector('#triage:not([hidden]) .route');
  await page.click('#triage-actions .route');
  await page.waitForSelector('#triage-actions .route .route-hint');
  await page.locator('#triage-actions .route', { hasText: 'Next action' }).first().click();
  await page.waitForTimeout(150);
}
try {
  for (const gap of [0, 10, 20]) {
    const { ctx, page } = await fresh();
    await routed(page, `g${gap}`);
    await page.waitForSelector('#cards .card-done');
    await page.evaluate(async (g) => {
      const b = document.querySelector('#cards .card-done');
      b.click(); await new Promise(r => setTimeout(r, g));
      if (b.isConnected) b.click();
    }, gap);
    await page.waitForTimeout(900);
    console.log(`A9 gap=${gap}ms  done.marked = ${await countKind(page,'done.marked')} (expected 1)`);
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    await routed(page, 'focus a'); await routed(page, 'focus b');
    await page.waitForSelector('#cards .card-done');
    await page.evaluate(() => document.querySelector('#cards .card-done').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    console.log('A10 focus after tick-off =', JSON.stringify(await page.evaluate(() => ({
      tag: document.activeElement?.tagName, id: document.activeElement?.id, cls: document.activeElement?.className }))));
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
