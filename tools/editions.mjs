// The two-build gate (ADR-0036).
//
// Quietkeep ships as two editions from one branch. The default cannot sync, and
// that claim rests on two independent guarantees, BOTH of which are the kind of
// thing that erodes silently:
//
//   1. the sync module is absent from the default bundle — a build-time
//      exclusion, "verifiable by reading the built artefact", which is what this
//      file actually does rather than trusting the entry point looks right;
//   2. the default origin cannot reach any other host — `tools/headers.mjs`.
//
// It also BUILDS the sync edition, because the alternative is a second `_headers`
// file maintained by hand next to a constant in TypeScript, and the day those
// two disagree is the day the app dials a host the browser blocks (silent, looks
// like "sync is broken") or the CSP allows a host nothing dials (a widened
// posture nobody is using). Generating one from the other makes that
// disagreement unrepresentable.
//
//   node tools/editions.mjs           build both editions and check them
//   node tools/editions.mjs --check   check only; do not write the sync build
//
// Exits non-zero on any failure.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNC_OUT = join(ROOT, 'dist', 'sync');
const checkOnly = process.argv.includes('--check');

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

// The one line that is the sync edition's whole network exposure, read from the
// SOURCE rather than restated here — a copy in this file would be one more thing
// to drift.
const hostSrc = readFileSync(join(ROOT, 'src', 'relay-host.ts'), 'utf8');
const RELAY_HOST = /export const RELAY_HOST = '([^']+)'/.exec(hostSrc)?.[1];

/** Symbols that only exist on the sync path. If any appears in the default
 *  bundle, the exclusion has failed however tidy the entry point looks. */
const SYNC_MARKERS = ['exchangeOnce', 'httpWire', 'beginPairing', 'quietkeep-pairing', 'RELAY_HOST'];

console.log('Default edition');
if (!existsSync(join(ROOT, 'public', 'app.js'))) {
  fail('public/app.js is missing — run `npm run build` first');
} else {
  const bundle = readFileSync(join(ROOT, 'public', 'app.js'), 'utf8');
  const found = SYNC_MARKERS.filter(m => bundle.includes(m));
  if (found.length) {
    fail(`the default bundle contains the sync module (${found.join(', ')}) — ` +
      'ADR-0036 requires it to be absent, not merely unreachable');
  } else {
    pass('no sync module in public/app.js — checked against the built file, not the entry point');
  }

  // The marker list is only worth anything if these strings really do appear
  // when the module IS present. Otherwise this gate passes forever by testing
  // for words nothing ever emits — the shape that has produced theatre in this
  // repo three times.
  const proof = execFileSync('npx', ['esbuild', 'src/ui/entry-sync.ts', '--bundle',
    '--format=esm', '--target=es2022', '--log-level=warning'], { cwd: ROOT, encoding: 'utf8' });
  const absent = SYNC_MARKERS.filter(m => !proof.includes(m));
  if (absent.length) {
    fail(`these markers do not appear in the SYNC bundle either (${absent.join(', ')}), ` +
      'so the check above proves nothing — fix the marker list');
  } else {
    pass('and every marker really does appear when the module is present, so the check has teeth');
  }
}

console.log('');
console.log('Sync edition');

if (!RELAY_HOST) {
  fail('src/relay-host.ts does not export a literal RELAY_HOST');
} else if (RELAY_HOST.includes('UNSET') || !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/.test(RELAY_HOST)) {
  // NOT a failure, and the distinction is the whole point of this branch.
  //
  // "There is no relay yet, so no sync edition is built" is a coherent, honest
  // state — it is where this repo is until the Cloudflare token gains Workers
  // permissions. Failing here would paint the whole pipeline red for something
  // no commit can fix, and a permanently red gate is one nobody reads.
  //
  // What must NEVER happen is the other thing: a sync edition built against a
  // guessed host. That ships an app which passes every check and dials into the
  // void, with no error on any device. So the edition is skipped, loudly, and
  // there is nothing to deploy.
  console.log(`  --    RELAY_HOST is "${RELAY_HOST}" — no relay is deployed, so the Sync edition is NOT built.`);
  console.log('        Quietkeep (the default) is unaffected and ships as normal.');
  console.log('        To change that: run the Relay workflow, and put the URL it prints in src/relay-host.ts.');
} else {
  pass(`the relay is ${RELAY_HOST}`);

  const origin = new URL(RELAY_HOST).origin;
  const headers = `# Security headers for Quietkeep SYNC — Doctrine §16.6, ADR-0036
#
# GENERATED by tools/editions.mjs from src/relay-host.ts. Do not hand-edit: the
# point of generating it is that the host the app dials and the host the browser
# permits cannot disagree.
#
# This edition differs from the default in exactly one directive. Everything else
# is identical, deliberately — the trade this build makes is "one named host for
# a second device", and it must not quietly become anything larger.

/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' ${origin}; manifest-src 'self'; worker-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
`;

  if (!checkOnly) {
    rmSync(SYNC_OUT, { recursive: true, force: true });
    mkdirSync(SYNC_OUT, { recursive: true });
    cpSync(join(ROOT, 'public'), SYNC_OUT, { recursive: true });
    execFileSync('npx', ['esbuild', 'src/ui/entry-sync.ts', '--bundle', '--format=esm',
      '--target=es2022', `--outfile=${join(SYNC_OUT, 'app.js')}`, '--sourcemap',
      '--log-level=warning'], { cwd: ROOT, stdio: 'inherit' });
    writeFileSync(join(SYNC_OUT, '_headers'), headers);

    // The service worker caches by a name carrying the release triplet. The two
    // editions are separate origins with separate caches, so this is belt and
    // braces — but a shared name would be a genuinely confusing bug to chase.
    const swPath = join(SYNC_OUT, 'sw.js');
    if (existsSync(swPath)) {
      const sw = readFileSync(swPath, 'utf8');
      writeFileSync(swPath, sw.replace(/quietkeep-(\d+\.\d+\.\d+)/g, 'quietkeep-sync-$1'));
      pass('the sync build\'s cache name is its own');
    }

    const built = readFileSync(join(SYNC_OUT, 'app.js'), 'utf8');
    if (SYNC_MARKERS.every(m => built.includes(m))) {
      pass('the sync bundle contains the sync module');
    } else {
      fail('the sync bundle does NOT contain the sync module — the edition would be the default with a wider CSP');
    }
    if (built.includes(origin)) {
      pass('and it dials exactly the host its CSP permits');
    } else {
      fail(`the sync bundle does not mention ${origin}, which its CSP permits — one of the two is wrong`);
    }
    console.log(`  ok    written to dist/sync`);
  } else {
    pass('check only — the sync build was not written');
  }
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Two editions from one branch: the default cannot sync, and the artefact proves it.');
