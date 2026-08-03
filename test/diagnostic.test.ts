// The diagnostic report (1.18.0, Doctrine §7f, ADR-0071).
//
// The load-bearing test here is `diag-privacy`: this app's whole promise is
// that nothing readable leaves the device, and the report is the one artefact
// designed to leave. So a store is built full of distinctive strings — titles,
// a person's name, a note, journal ciphertext — and the report is swept for
// every one of them. That is the privacy rule made falsifiable rather than
// merely intended, and it is the test that must never be relaxed to make a
// section render.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, gateOptionsFor, silentNodes } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { diagnosticReport, findings, kindCounts, clockCounts, type DeviceReading } from '../src/diagnostic.ts';
import { lastCopy } from '../src/copies.ts';
import { NODE_KINDS } from '../src/events.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-03T18:00:00.000Z';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: (over.id as string) ?? `dg${String(n++).padStart(6, '0')}`, vault: 'personal',
  at: (over.at as string) ?? '2026-08-03T12:00:00.000Z',
  device: (over.device as string) ?? 'd0', seq: (over.seq as number) ?? n,
  kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);

/** A healthy device: everything the app can check for is fine, so `findings`
 *  has nothing to say and the report must say THAT rather than nothing. */
const wellDevice = (over: Partial<DeviceReading> = {}): DeviceReading => ({
  triplet: '1.18.0', edition: 'default', cache: 'quietkeep-1.18.0',
  device: 'd0', zone: TZ, installed: true,
  storageSupported: true, persisted: true, quotaMb: 1024, usageMb: 2.4,
  paired: false, unreadableEntries: null, ...over,
});

// --- the privacy rule, which is the whole point ------------------------------

/** Every distinctive string a real store would hold. Each is deliberately
 *  unlike anything the report's own prose says, so a hit is a real leak and
 *  never a coincidence. */
const SECRETS = {
  title: 'zarquon the plumber quote',
  person: 'Ferdinand Kowalczyk-Nakamura',
  note: 'the gate code is 4417 round the back',
  project: 'moving house in Trebuchet Lane',
  journalCt: 'Q1lQSEVSVEVYVA',
  declined: 'the school fundraiser thing',
  anchor: 'the Wednesday sprint natter',
  menuItem: 'learn the hurdy-gurdy',
};

/** The same store, said in completely different words. Every string differs
 *  from its counterpart in SECRETS and nothing structural does — which is what
 *  makes the identical-output property below a statement about content and not
 *  about luck. */
const OTHER: typeof SECRETS = {
  title: 'wibble the roofing estimate',
  person: 'Perpetua Oyelaran-Whitfield',
  note: 'spare key under the third flowerpot',
  project: 'the allotment handover at Grimsditch',
  journalCt: 'RElGRkVSRU5UQ1Q',
  declined: 'the raffle committee ask',
  anchor: 'the Monday standup natter',
  menuItem: 'take up the theremin',
};

function loaded(SECRETS: Record<string, string>): { state: State; log: AppEvent[] } {
  const log: AppEvent[] = [];
  let s = emptyState();
  const put = (offered: AppEvent[]): void => {
    const admitted = admit(offered, s, gateOptionsFor(TZ));
    log.push(...admitted);
    s = fold(admitted, s);
  };

  put([ev('node.created', 'PRJ', { nodeKind: 'project', title: SECRETS.project })]);
  put([ev('node.created', 'W', { nodeKind: 'action', title: SECRETS.title, parent: 'PRJ' })]);
  put([ev('node.field.set', 'W', { field: 'note', value: SECRETS.note })]);
  put([ev('person.created', 'ADA', { name: SECRETS.person })]);
  put([ev('node.created', 'J', { nodeKind: 'journal', title: '' })]);
  put([ev('journal.entry.written', 'J', { v: 1, iv: 'aa', ct: SECRETS.journalCt })]);
  put([ev('journal.sealed', null, { salt: 'c2FsdA', iterations: 600_000 })]);
  put([ev('node.created', 'D', { nodeKind: 'action', title: SECRETS.declined })]);
  put([
    ev('request.declined', 'D', { person: 'ADA', what: SECRETS.declined, reason: 'detail' }),
    ev('park.set', 'D', { returnAt: '2026-08-24T23:59:59.000Z', reason: 'not-now-ledger' }),
  ]);
  put([ev('anchor.defined', 'A', { name: SECRETS.anchor, recurrence: 'Wednesdays' })]);
  put([ev('node.created', 'M', { nodeKind: 'aspiration', title: SECRETS.menuItem })]);
  put([ev('menu.item.added', 'M', { category: 'try' })]);
  put([ev('clock.set', 'W', { clockKind: 'due', at: '2026-08-10T23:59:59.000Z', source: 'me' })]);
  return { state: s, log };
}

test('diag-privacy: not one thing the reader wrote appears in the report', () => {
  const { state, log } = loaded(SECRETS);
  const text = diagnosticReport(state, log, wellDevice(), NOW);
  for (const [what, secret] of Object.entries(SECRETS)) {
    assert.equal(text.includes(secret), false,
      `the report leaks the ${what} ("${secret}") — this file is designed to be SENT to somebody`);
  }
  // And the fixture is real: if these were not in the store, the sweep above
  // would pass over an empty set and prove nothing (the fixture-not-result
  // lesson, 1.17.2).
  assert.equal(state.nodes.get('W')!.title, SECRETS.title, 'fixture: the title is in the store');
  assert.equal(state.nodes.get('ADA')!.title, SECRETS.person, 'fixture: the person is in the store');
  assert.ok(log.some(e => JSON.stringify(e.payload).includes(SECRETS.note)),
    'fixture: the note is in the log');
  assert.ok(log.some(e => JSON.stringify(e.payload).includes(SECRETS.journalCt)),
    'fixture: the sealed entry is in the log');
});

test('diag-privacy: the report is a function of SHAPE — same store, different words, identical text', () => {
  // The precise form of the rule, and the one that cannot false-positive.
  //
  // A substring sweep is noisy in both directions: a node titled "the numbers"
  // collided with the report's own prose the day this shipped (caught by the
  // smoke walk), proving nothing about leakage while failing loudly. And an
  // empty-store differential over-fires the other way — it flags the app's own
  // closed vocabulary, the clock kinds and "passphrase", as though a fixed word
  // were content.
  //
  // So the property is stated directly instead: **two stores with the same
  // shape and entirely different words must produce byte-identical reports.**
  // Nothing to allowlist, nothing to keep in step with the prose, and it fails
  // the moment any section starts printing something a reader supplied.
  const a = loaded(SECRETS);
  const b = loaded(OTHER);
  const textA = diagnosticReport(a.state, a.log, wellDevice(), NOW);
  const textB = diagnosticReport(b.state, b.log, wellDevice(), NOW);

  assert.equal(textA, textB,
    'the report changed when only the WORDS changed — something in it is reproducing content');

  // The fixture is real in both directions, or the equality above is two empty
  // reports agreeing with each other.
  assert.notDeepEqual(Object.values(SECRETS), Object.values(OTHER),
    'fixture: the two stores really do say different things');
  assert.equal(a.state.nodes.get('W')!.title, SECRETS.title);
  assert.equal(b.state.nodes.get('W')!.title, OTHER.title);
  assert.ok(textA.includes('person: 1'), 'fixture: the reports are non-trivial');
});

test('diag-privacy: it still reports the SHAPE of everything it refused to name', () => {
  const { state, log } = loaded(SECRETS);
  const text = diagnosticReport(state, log, wellDevice(), NOW);
  // Withholding content is only defensible if the counts survive — otherwise
  // the report is private and useless, which is not a trade this makes.
  assert.match(text, /person: 1/, 'the person is counted, just not named');
  assert.match(text, /journal: 1/, 'the entry is counted, just not read');
  assert.match(text, /anchor: 1/);
  assert.match(text, /On the Menu: 1/);
  assert.match(text, /In the Not Now ledger: 1/);
  assert.match(text, /due 1/, 'the clock kinds in use are named');
  assert.match(text, /Journal: a passphrase is set/);
});

// --- it leads with the diagnosis (§7f) --------------------------------------

test('diag-findings: a healthy store says so plainly, and does not claim more', () => {
  const { state, log } = loaded(SECRETS);
  // A copy, so the "no copy" finding does not fire.
  const withCopy = [...log, ev('export.written', null, { scope: 'all', at: NOW }, { at: NOW, seq: 9999 })];
  const f = findings(fold([], state), withCopy, wellDevice());
  assert.deepEqual(f, [], 'nothing the app knows how to check for is wrong');
  const text = diagnosticReport(state, withCopy, wellDevice(), NOW);
  // The honest sentence: not "everything is fine", which this cannot know.
  assert.match(text, /Nothing this report can see/);
  assert.match(text, /does not mean nothing is wrong/);
});

test('diag-findings: a silent node is reported as a CAUSE, with its kinds', () => {
  // Straight through `fold`, bypassing `admit` — this is the state the write
  // boundary exists to make impossible, which is exactly why the report has to
  // be able to describe it when it happens anyway.
  const broken = fold([ev('node.created', 'X', { nodeKind: 'action', title: 'stranded' })], emptyState());
  assert.equal(silentNodes(broken).length, 1, 'fixture: law 1 is broken');
  const f = findings(broken, [], wellDevice());
  assert.ok(f[0]?.startsWith('LAW 1 IS BROKEN'), 'it leads with the root cause');
  assert.match(f[0]!, /action/, 'and names the kind, which is shape, not content');
  assert.match(f[0]!, /downstream/, 'and says the rest may be consequence');
  // The verb agrees with the count, singular and plural. The plural read "31
  // things … is on no surface" until a real report was read by eye — on the
  // one line in the app whose entire job is to be believed.
  assert.match(f[0]!, /1 thing in this store is on no surface/);
  const many = fold([
    ev('node.created', 'X1', { nodeKind: 'action', title: 'a' }),
    ev('node.created', 'X2', { nodeKind: 'action', title: 'b' }),
  ], emptyState());
  assert.match(findings(many, [], wellDevice())[0]!, /2 things in this store are on no surface/);
});

test('diag-findings: each absence carries its reason, never a bare "missing"', () => {
  const empty = emptyState();
  const notKept = findings(empty, [], wellDevice({ persisted: false }));
  assert.ok(notKept.some(x => /home screen/.test(x)),
    'not-persisted says what would grant it, not merely that it is off');

  const stale = findings(empty, [], wellDevice({ cache: 'quietkeep-1.16.0' }));
  assert.ok(stale.some(x => /older code than the version stamp/.test(x)),
    'a stale cache explains the symptom it produces');

  // A locked journal is NOT zero unreadable entries, and must not read as it.
  const text = diagnosticReport(empty, [], wellDevice({ unreadableEntries: null }), NOW);
  assert.match(text, /not checked — the journal is locked or unset/);
  assert.equal(findings(empty, [], wellDevice({ unreadableEntries: null })).some(x => /would not open/.test(x)), false,
    'an unchecked journal raises no finding');
});

test('diag-findings: no copy, and work since a copy, are different sentences', () => {
  const { state, log } = loaded(SECRETS);
  assert.ok(findings(state, log, wellDevice()).some(x => /No copy has ever left/.test(x)));

  const copied = [...log, ev('export.written', null, { scope: 'all', at: NOW }, { at: NOW, seq: 9999 })];
  assert.equal(findings(state, copied, wellDevice()).some(x => /No copy has ever left/.test(x)), false);
  assert.ok(lastCopy(copied), 'fixture: the copy is recognised as a whole copy');

  const after = [...copied, ev('node.created', 'LATER', { nodeKind: 'action', title: 'after the copy' },
    { at: '2026-08-03T19:00:00.000Z', seq: 10_000 })];
  assert.ok(findings(state, after, wellDevice()).some(x => /no copy holds/.test(x)));
});

// --- the shape sections ------------------------------------------------------

test('diag-shape: every kind is listed including the zeroes', () => {
  const counts = kindCounts(loaded(SECRETS).state);
  for (const k of NODE_KINDS) {
    assert.equal(typeof counts[k], 'number', `${k} has a row`);
  }
  const text = diagnosticReport(loaded(SECRETS).state, loaded(SECRETS).log, wellDevice(), NOW);
  // A missing row reads as an oversight; a zero is a fact somebody diagnosing
  // an empty surface actually needs.
  assert.match(text, /pebble: 0/);
  assert.match(text, /resume-card: 0/);
});

test('diag-shape: both "held" numbers appear, because 1.15.1 made them different questions', () => {
  const { state, log } = loaded(SECRETS);
  const text = diagnosticReport(state, log, wellDevice(), NOW);
  assert.match(text, /Held as work \(what the gauge counts\)/);
  assert.match(text, /Held altogether/);
  assert.match(text, /On no surface at all \(must be 0\): 0/);
});

test('diag-shape: an empty store produces a whole report rather than a blank one', () => {
  const text = diagnosticReport(emptyState(), [], wellDevice(), NOW);
  assert.ok(text.length > 400, 'a fresh device still gets a full report');
  assert.match(text, /Events in the log: 0/);
  assert.match(text, /Clocks in use: none/);
  assert.equal(Object.keys(clockCounts(emptyState())).length, 0);
});

test('diag-shape: nothing renders as undefined, NaN or [object Object]', () => {
  for (const [label, text] of [
    ['empty', diagnosticReport(emptyState(), [], wellDevice(), NOW)],
    ['loaded', diagnosticReport(loaded(SECRETS).state, loaded(SECRETS).log, wellDevice(), NOW)],
    ['unknowns', diagnosticReport(emptyState(), [], wellDevice({
      cache: null, quotaMb: null, usageMb: null, storageSupported: false, persisted: false,
    }), NOW)],
  ] as const) {
    for (const bad of ['undefined', 'NaN', 'Invalid Date', '[object Object]', 'null']) {
      assert.equal(text.includes(bad), false, `${label}: the report renders "${bad}"`);
    }
  }
});

// --- what it says about itself ----------------------------------------------

test('diag-words: it states what it does NOT contain, in the file itself', () => {
  const text = diagnosticReport(loaded(SECRETS).state, loaded(SECRETS).log, wellDevice(), NOW);
  assert.match(text, /WHAT THIS REPORT DOES NOT CONTAIN/);
  assert.match(text, /Nothing you wrote/);
  // And points at the export as the reproduction case rather than duplicating
  // it — the constitution's own answer.
  assert.match(text, /reproduction case/);
  assert.match(text, /only if you want to/);
});

test('diag-words: it carries no score, no verdict and no shame vocabulary (law 5)', () => {
  const { state, log } = loaded(SECRETS);
  const text = diagnosticReport(state, log, wellDevice({ persisted: false }), NOW);
  assert.doesNotMatch(text, /\b(overdue|streak|behind|healthy|score|grade|%)/i,
    'a diagnostic describes; it does not mark the reader out of ten');
});
