// Brand asset renderer and checker.
//
// Renders public/brand/icon.svg to every size the app needs, composites the
// social preview, and then MEASURES the results — contrast computed rather than
// eyeballed (ACCESSIBILITY.md B-08), and the 48px legibility question answered by
// sampling actual rendered pixels rather than by looking at a big version and
// hoping.
//
// Instrument: playwright-core against the sandbox's chromium. Those two are a
// MATCHED PAIR — see the hub's LESSONS.md §8. playwright-core 1.56.0 ships
// chromium revision 1194, which is what /opt/pw-browsers/chromium-1194 is. Do not
// bump one without the other.
//
//   node tools/brand.mjs            render + check
//   node tools/brand.mjs --check    check only, exits non-zero on failure

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = join(ROOT, 'public', 'brand');
const CHECK_ONLY = process.argv.includes('--check');

const SANDBOX_CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const launchOpts = { args: ['--no-sandbox'] };
if (existsSync(SANDBOX_CHROMIUM)) launchOpts.executablePath = SANDBOX_CHROMIUM;

// ---------------------------------------------------------------- colour maths

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const ratio = (a, b) => {
  const [x, y] = [Array.isArray(a) ? lum(a) : lum(hex(a)), Array.isArray(b) ? lum(b) : lum(hex(b))]
    .sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// ------------------------------------------------------ the palette (B-10)
// Kept here as named constants so the renderer and the checker cannot disagree
// with each other about what the brand is.

const FIELD = '#F4F1E9';       // warm paper
const WALL = '#33425F';        // the sheltering form
const LIGHT = '#F5C978';       // the lit opening — the one warm note
const TYPE_STRONG = '#F7F4EE'; // wordmark on the preview
const TYPE = '#E9EDF4';        // secondary type on the preview

// The preview's source image is dusk-dark. This lift brightens it without
// washing it out — measured against the alternatives at 1.8 and 2.4, both of
// which flatten the scene and kill the one small lamp that makes it read as
// *lit* rather than merely blue.
const SOCIAL_LIFT = 'brightness(1.35) saturate(1.05)';

// ------------------------------------------------------------------- the sizes

const ICONS = [
  { file: 'icon-1024.png', size: 1024, note: 'source / stores' },
  { file: 'icon-512.png', size: 512, note: 'PWA manifest' },
  { file: 'icon-192.png', size: 192, note: 'PWA manifest' },
  { file: 'icon-maskable-512.png', size: 512, note: 'maskable — same art, safe zone verified' },
  { file: 'apple-touch-icon.png', size: 180, note: 'iOS home screen, opaque' },
  { file: 'favicon-32.png', size: 32, note: 'the honest worst case' },
  { file: 'icon-48.png', size: 48, note: 'the legibility test' },
];

const SOCIAL = { file: 'social-preview.png', width: 1280, height: 640 };

const failures = [];
const fail = (msg) => { failures.push(msg); console.error(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// ---------------------------------------------------------------------- render

async function renderIcons(browser) {
  const svg = readFileSync(join(BRAND, 'icon.svg'), 'utf8');
  const page = await browser.newPage();
  for (const { file, size } of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:${FIELD}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: join(BRAND, file), omitBackground: false });
    console.log(`  rendered ${file} (${size}x${size})`);
  }
  await page.close();
}

/** The composite's markup. `withText:false` yields the plate the wordmark sits on,
 *  which is what the contrast check has to measure against — sampling the finished
 *  image just re-reads the glyphs and reports a meaningless 1.00:1. */
function socialHtml(b64, withText) {
  return `<style>
    html,body{margin:0;padding:0;width:${SOCIAL.width}px;height:${SOCIAL.height}px;overflow:hidden}
    .wrap{position:relative;width:${SOCIAL.width}px;height:${SOCIAL.height}px;background:${WALL}}
    .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${SOCIAL_LIFT}}
    .text{position:absolute;right:88px;top:50%;transform:translateY(-50%);width:620px;text-align:right;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      visibility:${withText ? 'visible' : 'hidden'}}
    h1{margin:0;font-size:104px;line-height:1;font-weight:600;letter-spacing:-.02em;color:${TYPE_STRONG}}
    p{margin:26px 0 0;font-size:38px;line-height:1.34;font-weight:400;color:${TYPE}}
    .rule{margin:34px 0 0 auto;width:132px;height:5px;border-radius:3px;background:${LIGHT}}
  </style>
  <div class="wrap">
    <img class="bg" src="data:image/png;base64,${b64}">
    <div class="text">
      <h1>Quietkeep</h1>
      <p>Out of sight.<br>Never out of mind.</p>
      <div class="rule"></div>
    </div>
  </div>`;
}

/** Screenshot some markup and hand back the PNG as base64, without touching disk. */
async function shot(browser, html, width, height) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  const buf = await page.screenshot();
  await page.close();
  return buf.toString('base64');
}

function backgroundB64() {
  const bg = join(BRAND, 'social-background.png');
  if (!existsSync(bg)) return null;
  return readFileSync(bg).toString('base64');
}

async function renderSocial(browser) {
  const b64 = backgroundB64();
  if (!b64) { fail('social-background.png is missing — cannot composite the preview'); return; }
  const page = await browser.newPage();
  await page.setViewportSize({ width: SOCIAL.width, height: SOCIAL.height });
  await page.setContent(socialHtml(b64, true), { waitUntil: 'load' });
  await page.screenshot({ path: join(BRAND, SOCIAL.file) });
  await page.close();
  console.log(`  rendered ${SOCIAL.file} (${SOCIAL.width}x${SOCIAL.height})`);
}

// ----------------------------------------------------------------------- check

/** Decode a PNG in the browser and return {width,height,at(x,y)}. */
async function inspect(browser, file) {
  return inspectB64(browser, readFileSync(join(BRAND, file)).toString('base64'));
}

async function inspectB64(browser, b64) {
  const page = await browser.newPage();
  const data = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, px: Array.from(px) };
  }, `data:image/png;base64,${b64}`);
  await page.close();
  const at = (x, y) => {
    const i = (Math.round(y) * data.width + Math.round(x)) * 4;
    return [data.px[i], data.px[i + 1], data.px[i + 2]];
  };
  return { width: data.width, height: data.height, at };
}

async function checkIcons(browser) {
  console.log('\nIcons');
  for (const { file, size } of ICONS) {
    const p = join(BRAND, file);
    if (!existsSync(p)) { fail(`${file} missing`); continue; }
    const img = await inspect(browser, file);
    if (img.width !== size || img.height !== size) {
      fail(`${file} is ${img.width}x${img.height}, expected ${size}x${size}`);
      continue;
    }
    // Three sample points, in icon-relative coordinates: the field corner, the
    // shelter's left band, and the lit opening's centre.
    const u = (f) => f * size;
    const field = img.at(u(0.04), u(0.04));
    const shelter = img.at(u(0.28), u(0.5));
    const light = img.at(u(0.5), u(0.5));

    const rShelter = ratio(shelter, field);
    const rLight = ratio(light, shelter);
    const ok = rShelter >= 3 && rLight >= 3;
    (ok ? pass : fail)(
      `${file.padEnd(24)} shelter/field ${rShelter.toFixed(2)}:1  light/shelter ${rLight.toFixed(2)}:1` +
      (ok ? '' : '  — a graphical object needs 3:1 (WCAG 1.4.11)'),
    );

    // Grayscale survival: with hue removed the three zones must still separate.
    const g = (c) => Math.round(lum(c) * 255);
    if (Math.abs(g(shelter) - g(field)) < 20) fail(`${file}: shelter and field collapse in grayscale`);
  }

  // Maskable safe zone: nothing painted outside the centre 80% circle.
  const m = await inspect(browser, 'icon-maskable-512.png');
  if (m.width) {
    const c = m.width / 2, r = m.width * 0.4;
    const field = m.at(4, 4);
    let outside = 0;
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      const x = c + Math.cos(rad) * (r + 6), y = c + Math.sin(rad) * (r + 6);
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
      if (ratio(m.at(x, y), field) > 1.1) outside++;
    }
    (outside === 0 ? pass : fail)(
      `maskable safe zone: ${outside === 0 ? 'artwork inside the centre 80% circle' : `${outside} sample points painted outside it`}`,
    );
  }
}

async function checkSocial(browser) {
  console.log('\nSocial preview');
  const p = join(BRAND, SOCIAL.file);
  if (!existsSync(p)) { fail(`${SOCIAL.file} missing`); return; }
  const img = await inspect(browser, SOCIAL.file);
  (img.width === SOCIAL.width && img.height === SOCIAL.height ? pass : fail)(
    `dimensions ${img.width}x${img.height} (GitHub wants ${SOCIAL.width}x${SOCIAL.height})`,
  );
  const kb = statSync(p).size / 1024;
  (kb < 1024 ? pass : fail)(`weight ${kb.toFixed(0)} KB (GitHub's limit is 1 MB)`);

  // Measure the type against the plate BEHIND it — the same composite with the
  // text hidden. Sampling the finished image just re-reads the glyphs and reports
  // a meaningless 1.00:1, which is exactly what the first version of this check
  // did. An instrument that measures itself is not measuring anything.
  const b64 = backgroundB64();
  if (!b64) return;
  const plate = await inspectB64(browser, await shot(browser, socialHtml(b64, false), SOCIAL.width, SOCIAL.height));

  // Two zones, because the two type colours are different: the wordmark's band
  // and the tagline's, both across the full width the text can occupy.
  const zones = [
    { name: `wordmark  ${TYPE_STRONG}`, fg: TYPE_STRONG, x0: 600, x1: 1210, y0: 190, y1: 290, min: 4.5 },
    { name: `tagline   ${TYPE}`, fg: TYPE, x0: 600, x1: 1210, y0: 310, y1: 420, min: 4.5 },
    { name: `rule      ${LIGHT}`, fg: LIGHT, x0: 1050, x1: 1200, y0: 440, y1: 465, min: 3.0 },
  ];
  for (const z of zones) {
    let worst = Infinity, worstAt = null;
    for (let x = z.x0; x <= z.x1; x += 10) {
      for (let y = z.y0; y <= z.y1; y += 10) {
        const r = ratio(z.fg, plate.at(x, y));
        if (r < worst) { worst = r; worstAt = [x, y]; }
      }
    }
    (worst >= z.min ? pass : fail)(
      `${z.name} vs the plate behind it: worst ${worst.toFixed(2)}:1 at ${worstAt} (needs ${z.min}:1)`,
    );
  }
}

// ------------------------------------------------------------------------ main

const browser = await chromium.launch(launchOpts);
try {
  if (!existsSync(BRAND)) mkdirSync(BRAND, { recursive: true });
  if (!CHECK_ONLY) {
    console.log('Rendering');
    await renderIcons(browser);
    await renderSocial(browser);
  }
  await checkIcons(browser);
  await checkSocial(browser);
} finally {
  // Close explicitly. LESSONS §8: a script that leaves the browser open looks
  // like a protocol hang, and Node block-buffers stdout to a pipe so you see
  // nothing at all while you misdiagnose it.
  await browser.close();
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('All brand checks passed.');
