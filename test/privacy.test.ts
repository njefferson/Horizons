// Nothing personal about the owner ever lands in this repo. FAIL state.
//
// The rule, stated by the owner 2026-08-04: nothing personal or embarrassing
// about him is ever recorded in the repo. That is a FAIL state.
//
// The line that decides every case: his design statements are repo material;
// who he is, is not. The product's framing ("a planner for neurodivergent
// users") is public and fine; research about users as a population
// (docs/nd-collisions.md) is fine; a sentence whose predicate is a diagnosis,
// health fact, or identity disclosure and whose subject is the OWNER is not.
// The patterns anchor on exactly that structure — the person, linked by a verb,
// to the term — because the same nouns appear legitimately a hundred times in
// this repo's honest product prose. A rule that lives only in prose loses to
// whoever is in a hurry (hub Doctrine §16.8); this test is the teeth. The hub's
// privacy-check.mjs carries the same patterns for every sibling repo.
//
// The patterns are deliberately NARROW: a false positive teaches sessions to
// route around the gate, and the product's own vocabulary must never trip it.
//
// THIS FILE MAY NOT EXEMPT ITSELF. An earlier version skipped itself whole, on
// the reasoning that a pattern is not a disclosure — true of the patterns and
// false of the prose and fixtures around them, which then went unscanned. Only
// the sentinel region below is skipped, its probes are synthetic rather than
// quoted, and the region itself may carry neither a name nor a date.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// privacy-gate:patterns-begin
// A VERBATIM MIRROR of the hub's privacy-patterns.mjs. It exists so this
// repo's `npm test` fails with no hub present; it is held identical by
// GATE hub:privacy-mirror-check.mjs, which the Spine runs. Do not edit these
// lines here — change the hub, then copy the block across.
const DISCLOSURE = [
  /\b(?:noah|the owner|he|she|they)\s+(?:is|was|are|were|being|remains)\s+(?:\w+\s+){0,2}?(?:audhd|adhd|autistic|neurodivergent)\b/i,
  // `diagnosed` only counts as a disclosure when something is diagnosed WITH
  // something. Bare "diagnosed" is ordinary engineering English about a FAULT,
  // and this pattern used to swallow it: a release note reading "they are
  // still not diagnosed, only absent" — about console warnings — failed the
  // gate and blocked FOUR consecutive deploys before anyone noticed.
  /\b(?:noah|the owner|he|she|they)\s+(?:is|was|are|were|being|remains)\s+(?:\w+\s+){0,2}?diagnosed\s+with\b/i,
  /\b(?:audhd|adhd|autistic|neurodivergent)\s+(?:owner|maker|author)\b/i,
  /\bconfirmed\b[^\n]{0,50}\b(?:he|she|they)\s+(?:is|are)\s+neurodivergent\b/i,
  /\b(?:noah|the owner)\b[^\n]{0,30}\b(?:medication|therapy|diagnosis|diagnosed)\b/i,
];

// SYNTHETIC probes, not quotations. Every subject here is a bare pronoun or a
// bracketed placeholder, so each one exercises a pattern while asserting
// nothing about any real person. Deliberate: an earlier version of this file
// carried the sentences a session had actually written, labelled as such, and
// so reproduced the disclosure in the repo the gate was written to protect.
const PROBES = [
  'they are autistic',
  'they were diagnosed with [placeholder]',
  'an autistic maker',
  'confirmed in a note that they are neurodivergent',
  'the owner [placeholder] diagnosis',
];
// privacy-gate:patterns-end

// What the skipped region may never contain, once its regex literals are set
// aside. A pattern's source legitimately names the owner token — that IS the
// anchor it matches on — so the guard reads the region's prose and probes,
// which are the only places a real sentence could hide.
const REGION_FORBIDDEN: Array<[RegExp, string]> = [
  [/\bnoah\b/i, 'the owner’s name outside a pattern'],
  [/\b20\d\d-\d\d-\d\d\b/, 'a date'],
];

// A line that opens with `/` but not `//` is a regex literal, not prose.
const isPatternSource = (line: string): boolean => /^\s*\/(?!\/)/.test(line);

const BEGIN = 'privacy-gate:patterns-begin';
const END = 'privacy-gate:patterns-end';

function split(text: string): { body: string; region: string } {
  const body: string[] = [];
  const region: string[] = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (line.includes(BEGIN)) { inside = true; body.push(''); continue; }
    if (line.includes(END)) { inside = false; body.push(''); continue; }
    if (inside) {
      if (!isPatternSource(line)) region.push(line);
      body.push('');
    } else { body.push(line); }
  }
  return { body: body.join('\n'), region: region.join('\n') };
}

const tracked = (): string[] =>
  execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(f => /\.(md|ts|mjs|js|html|txt)$/.test(f));

// Meta-prose names the TERM first and the person second; a real disclosure
// leads with the person, which is what the patterns anchor on.
test('FAIL STATE — no tracked file attaches a diagnosis or health fact to the owner', () => {
  const hits: string[] = [];
  for (const f of tracked()) {
    const { body } = split(readFileSync(join(ROOT, f), 'utf8'));
    for (const p of DISCLOSURE) {
      const m = p.exec(body);
      // LOCATION ONLY, never the matched text — an assertion message lands in
      // a CI log, and on a public repo that log is public. Quoting the find
      // republishes it on every failure.
      if (m) hits.push(`${f}:${body.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(hits, [],
    'personal disclosure(s) about the owner found in tracked files — remove the sentence, not the gate');
});

test('the skipped region carries no name and no date, in any file', () => {
  const hits: string[] = [];
  for (const f of tracked()) {
    const { region } = split(readFileSync(join(ROOT, f), 'utf8'));
    if (!region.trim()) continue;
    for (const [p, what] of REGION_FORBIDDEN) {
      if (p.test(region)) hits.push(`${f}: sentinel-skipped region contains ${what}`);
    }
  }
  assert.deepEqual(hits, [],
    'the one region the gate does not read must stay incapable of holding a disclosure');
});

test('the gate BITES — each pattern catches the class it exists for', () => {
  // Made to fail once before being trusted (Doctrine §6).
  for (const v of PROBES) {
    assert.ok(DISCLOSURE.some(p => p.test(v)), `pattern set misses a probe`);
  }
  // Every pattern must be exercised by at least one probe, or a pattern could
  // rot unnoticed behind the others.
  DISCLOSURE.forEach((pattern, i) => {
    assert.ok(PROBES.some(v => pattern.test(v)), `pattern ${i} has no probe`);
  });
  // And the product's own public vocabulary must NEVER trip — a gate that
  // fails the app's honest framing teaches sessions to route around it.
  const legitimate = [
    'a free, local-first planner for neurodivergent users',
    'For autistic and AuDHD people, special interests are the deepest reservoir',
    'how neurodivergent users typically collide with planning systems',
    'ADHD/autistic/AuDHD executive-function research',
    // THE REGRESSION THAT COST FOUR DEPLOYS. A sibling's release note said this
    // about console warnings; the pattern matched "they are ... diagnosed" and
    // failed a HARD CI gate, so four releases never left the branch while every
    // push was reported as shipped. `diagnosed` is ordinary engineering English
    // about a FAULT. If this line ever fails again, the pattern has re-widened.
    'they are still not diagnosed, only absent',
    'the cache was diagnosed as stale, not missing',
  ];
  for (const l of legitimate) {
    assert.ok(!DISCLOSURE.some(p => p.test(l)), `false positive on: "${l}"`);
  }
});
