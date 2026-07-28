// CHANGELOG.md is generated, and the triplet is asserted across the repo.
//
// Doctrine §7: "The service-worker cache name and the changelog's top entry
// carry the same triplet — bump them together." That is a rule someone has to
// remember, right up until it is a check that fails. This is the check.
//
//   node tools/changelog.mjs           rewrite CHANGELOG.md from the source
//   node tools/changelog.mjs --check   verify, exit non-zero on any drift
//
// The source of truth is src/ui/changelog.ts — the same array the app renders in
// its (i) panel, so the notes a user reads and the notes in the repo cannot say
// different things.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES, CURRENT } from '../src/ui/changelog.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

// --- the document ----------------------------------------------------------

const render = () => {
  const lines = [
    '# Changelog',
    '',
    'What changed, written for the person using Quietkeep rather than for whoever',
    'wrote it (Doctrine §5). Patch notes tell the truth: no absolutes the tests do',
    'not back (§14).',
    '',
    'Numbering is `version.capability.iteration` (§7). Each release is exactly one',
    'kind — **VERSION** changes what the app is, **CAPABILITY** means it can do',
    'something it could not, **ITERATION** refines something that already exists.',
    '',
    '**Releases do not have names.** No monikers, no codenames — a release is its',
    'triplet and what it did for you.',
    '',
    '> Generated from `src/ui/changelog.ts`, which is what the app itself shows in',
    "> its (i) panel. Edit that, then run `npm run changelog`. Don't edit this file.",
    '',
  ];
  for (const r of RELEASES) {
    lines.push(`## ${r.triplet} — ${r.kind}`, '', `*${r.date}*`, '');
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
};

// --- the checks ------------------------------------------------------------

const swPath = join(ROOT, 'public', 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const cache = /const CACHE = '([^']+)'/.exec(sw)?.[1];
const expected = `quietkeep-${CURRENT.triplet}`;

console.log('Release triplet');
(cache === expected ? pass : fail)(
  `service-worker cache name is "${cache}", changelog head is ${CURRENT.triplet} → expected "${expected}"`,
);

// One kind per release, and the triplet must match the kind that was claimed.
const SLOT = { VERSION: 0, CAPABILITY: 1, ITERATION: 2 };
for (let i = 0; i < RELEASES.length - 1; i++) {
  const [cur, prev] = [RELEASES[i], RELEASES[i + 1]];
  const c = cur.triplet.split('.').map(Number);
  const p = prev.triplet.split('.').map(Number);
  const slot = SLOT[cur.kind];
  const bumpedRight = c[slot] === p[slot] + 1;
  const zeroedAfter = c.slice(slot + 1).every((n) => n === 0);
  const untouchedBefore = c.slice(0, slot).every((n, j) => n === p[j]);
  (bumpedRight && zeroedAfter && untouchedBefore ? pass : fail)(
    `${prev.triplet} → ${cur.triplet} as a ${cur.kind} release ` +
    `(bump slot ${slot}, zero the rest)`,
  );
}

for (const r of RELEASES) {
  if (r.notes.length === 0) fail(`${r.triplet} has no notes — a release the user cannot read about is not documented`);
  if ('name' in r) fail(`${r.triplet} carries a name. Releases do not have names (§7).`);
}

// --- domain-vocabulary survival (the "horizons" check the docs claim exists) ---
// A careless global rename of the product could silently delete law 4's own
// statement. This asserts the domain terms are still present. Cheap, and it
// makes true a claim NOTES.md had been making without a gate behind it (audit).
const DOMAIN_TERMS = ['higher horizons', 'horizon-integrity'];
const scanDirs = ['docs', 'src'];
const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (name.name === 'node_modules') continue;
    const rel = `${dir}/${name.name}`;
    if (name.isDirectory()) out.push(...walk(rel));
    else if (/\.(md|ts)$/.test(name.name)) out.push(rel);
  }
  return out;
};
console.log('\nDomain vocabulary (law 4)');
const corpus = scanDirs.flatMap(walk).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n').toLowerCase();
for (const term of DOMAIN_TERMS) {
  (corpus.includes(term) ? pass : fail)(`"${term}" survives — a rename did not delete law 4's own vocabulary`);
}

// --- write or verify -------------------------------------------------------

const out = render();
const path = join(ROOT, 'CHANGELOG.md');
if (CHECK) {
  let current = '';
  try { current = readFileSync(path, 'utf8'); } catch { /* absent counts as drift */ }
  (current === out ? pass : fail)('CHANGELOG.md matches src/ui/changelog.ts — run `npm run changelog`');
} else {
  writeFileSync(path, out);
  console.log(`  wrote CHANGELOG.md (${RELEASES.length} release${RELEASES.length === 1 ? '' : 's'})`);
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Changelog and triplet are consistent.');
