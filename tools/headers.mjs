// The network posture gate (ADR-0036).
//
// Quietkeep's guarantee is not "we did not write any sync code". It is that the
// BROWSER refuses to let this build talk to anything but its own origin —
// `connect-src 'self'`, enforced by the platform rather than by our discipline.
//
// That guarantee is one line in `public/_headers`, which makes it exactly the
// kind of thing that erodes quietly: a future session adds a font host, a
// analytics snippet, a "just for debugging" endpoint, and nobody notices that
// the default build is no longer incapable of exfiltration — only unwilling.
//
// So it is gated. This asserts the default build can reach nothing but itself,
// and it is written to fail loudly on the day someone widens it, whether or not
// they meant to.
//
//   node tools/headers.mjs        (exits non-zero on any failure)

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = join(ROOT, 'public', '_headers');

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

if (!existsSync(HEADERS)) {
  console.error('public/_headers is missing — the security headers are not optional.');
  process.exit(1);
}
const text = readFileSync(HEADERS, 'utf8');

// Only the POLICY lines. Comment lines start with `#` and routinely mention
// hosts in prose; judging those would make the gate fire on its own explanation.
const policyLines = text
  .split('\n')
  .filter(l => !l.trimStart().startsWith('#'))
  .join('\n');

const csp = /Content-Security-Policy:\s*([^\n]+)/.exec(policyLines)?.[1];
if (!csp) {
  fail('no Content-Security-Policy in public/_headers');
} else {
  pass('a Content-Security-Policy is served');

  const directives = new Map(
    csp.split(';').map(d => d.trim()).filter(Boolean).map(d => {
      const [name, ...values] = d.split(/\s+/);
      return [name, values];
    }),
  );

  // THE ONE THAT MATTERS. `connect-src` is what fetch/XHR/WebSocket/EventSource
  // are judged against, so it is the whole question of whether this build can
  // send anything anywhere.
  const connect = directives.get('connect-src');
  if (!connect) {
    // Absent means it falls back to default-src. That may even be stricter, but
    // "may be" is not the standard here: the guarantee has to be stated where a
    // reader looks for it.
    fail('connect-src is not stated explicitly — the default build\'s network posture must be written down, not inherited');
  } else if (connect.length === 1 && connect[0] === "'self'") {
    pass("connect-src is exactly 'self' — this build cannot reach another host, and the browser enforces it");
  } else {
    fail(`connect-src is "${connect.join(' ')}" — the default build must reach nothing but its own origin (ADR-0036). ` +
      'If this is the Quietkeep Sync build, it needs its own headers file and its own gate, not a widened default.');
  }

  if (directives.get('default-src')?.join(' ') === "'none'") {
    pass("default-src is 'none' — everything is denied unless named");
  } else {
    fail(`default-src should be 'none'; got "${directives.get('default-src')?.join(' ') ?? '(absent)'}"`);
  }

  // No directive anywhere may name an external origin. `connect-src` is the
  // exfiltration path, but a script or style host is a code-execution path, and
  // an img host is a beacon — a 1×1 GIF with an id in the query string is
  // telemetry however it is described in the commit that adds it.
  const EXTERNAL = /(^|[\s'"])(https?:)?\/\/[^\s'";]+/;
  for (const [name, values] of directives) {
    const joined = values.join(' ');
    if (EXTERNAL.test(joined)) {
      fail(`${name} names an external origin ("${joined}") — nothing in the default build may reach off-origin`);
    }
  }
  if (![...directives].some(([, v]) => EXTERNAL.test(v.join(' ')))) {
    pass('no directive names an external origin — no fonts, no CDNs, no beacons');
  }
}

// Belt and braces, and it catches the case the CSP cannot: a header that is not
// the CSP at all. `Report-To`/`report-uri` point at a collector, which is
// telemetry by another name however it is labelled.
for (const bad of ['report-uri', 'report-to', 'Report-To', 'Reporting-Endpoints']) {
  if (policyLines.includes(bad)) {
    fail(`"${bad}" sends reports off-device — that is telemetry, which this app does not do`);
  }
}
if (!['report-uri', 'report-to', 'Report-To', 'Reporting-Endpoints'].some(b => policyLines.includes(b))) {
  pass('nothing reports anywhere');
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('The default build can reach nothing but itself, and the browser is what enforces it.');
