// Nothing personal about the owner ever lands in this repo. FAIL state.
//
// Noah, 2026-08-04, verbatim: "Make sure you never record anything in the repo
// that is personal or embarrassing for me. That is a FAIL state."
//
// Said the same day a session — recording design conversation faithfully —
// wrote two lines into this public repo that linked him personally to a
// neurotype. The repo's product framing ("a planner for neurodivergent users")
// is public and fine; research about users as a population
// (docs/nd-collisions.md) is fine; **a sentence that attaches a diagnosis,
// health fact, or identity disclosure to the OWNER is not**, and the
// difference is exactly the anchor these patterns require: the person, linked
// by a verb, to the term. A rule that lives only in prose loses to whoever is
// in a hurry (hub Doctrine §16.8) — and it already did, once, before it was a
// day old. This test is the teeth. The hub's privacy-check.mjs carries the
// same patterns for every sibling repo.
//
// The patterns are deliberately NARROW: a false positive teaches sessions to
// route around the gate, and the product's own vocabulary must never trip it.
// Widening them is cheap when a new class appears; the class that already
// happened is covered exactly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const DISCLOSURE = [
  // The person, linked by a verb, to a neurotype/diagnosis term.
  /\b(?:noah|the owner|he|she|they)\s+(?:is|was|are|were|being|remains)\s+(?:\w+\s+){0,2}?(?:audhd|adhd|autistic|neurodivergent|diagnosed)\b/i,
  // The term used as the owner's epithet.
  /\b(?:audhd|adhd|autistic|neurodivergent)\s+(?:owner|maker|author)\b/i,
  // The confirmation shape the actual violation took.
  /\bconfirmed\b[^\n]{0,50}\b(?:he|she|they)\s+(?:is|are)\s+neurodivergent\b/i,
  // Health/medical statements about the person.
  // `diagnosis|diagnosed` and NOT `diagnos\\w+` — the app's own §7f feature is
  // the "diagnostic report", and its name appears beside Noah's constantly
  // ("Noah's diagnostic", "Noah sent a diagnostic"). The first draft of this
  // pattern failed the repo on the feature's name, found on this gate's very
  // first run against the real tree.
  /\b(?:noah|the owner)\b[^\n]{0,30}\b(?:medication|therapy|diagnosis|diagnosed)\b/i,
];

const tracked = (): string[] =>
  execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(f => /\.(md|ts|mjs|js|html|txt)$/.test(f));

[personal information removed]
  const hits: string[] = [];
  for (const f of tracked()) {
    // This file carries the patterns themselves; scanning it would match its
    // own regex source, which is a pattern and not a disclosure.
    if (f === 'test/privacy.test.ts') continue;
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const p of DISCLOSURE) {
      const m = p.exec(text);
      if (m) hits.push(`${f}: "${m[0]}"`);
    }
  }
  assert.deepEqual(hits, [],
    'personal disclosure(s) about the owner found in tracked files — remove the sentence, not the gate');
});

test('the gate BITES — each pattern catches the class it exists for', () => {
  // Made to fail once before being trusted (Doctrine §6): the exact strings a
  // session actually wrote, plus the epithet shape, must all trip.
  const violations = [
[personal information removed]
[personal information removed]
[personal information removed]
[personal information removed]
  ];
  for (const v of violations) {
    assert.ok(DISCLOSURE.some(p => p.test(v)), `pattern set misses: "${v}"`);
  }
  // And the product's own public vocabulary must NEVER trip — a gate that
  // fails the app's honest framing teaches sessions to route around it.
  const legitimate = [
    'a free, local-first planner for neurodivergent users',
    'For autistic and AuDHD people, special interests are the deepest reservoir',
    'how neurodivergent users typically collide with planning systems',
    'ADHD/autistic/AuDHD executive-function research',
  ];
  for (const l of legitimate) {
    assert.ok(!DISCLOSURE.some(p => p.test(l)), `false positive on: "${l}"`);
  }
});
