// The seam audit's confirmed findings, pinned (1.17.3).
//
// Fourteen findings survived adversarial verification — six finder lenses, then
// a skeptic per finding told to refute it, and none were refuted. Each test here
// carries its finding's number and pins the FIX, so the defect cannot return
// without a named test going red. The convention is `audit-regressions.test.ts`
// from 1.9.2: family-prefixed names, one seam per test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, gateOptionsFor, coverageGauge, silentNodes } from '../src/gate.ts';
import { fold, emptyState, isAppClock, type State } from '../src/fold.ts';
import { NOT_ACTIONABLE } from '../src/kinds.ts';
import { nextUpQueue } from '../src/nextup.ts';
import { heldGroups } from '../src/held.ts';
import { legalMergeTargets, mergePlan } from '../src/ui/merge-intents.ts';
import { eligible } from '../src/ui/bulk-intents.ts';
import { settlePebbleEvents } from '../src/ui/load-intents.ts';
import { untrashEvents } from '../src/ui/detail-intents.ts';
import { loadNow } from '../src/load.ts';
import { toCalendar, calendarCount, exportsToCalendar } from '../src/ics.ts';
import { deltaBetween } from '../src/delta.ts';
import { todayCard } from '../src/today.ts';
import { workSurface } from '../src/nextup.ts';
import { declinePair } from '../src/ui/request-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-03T18:00:00.000Z';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: (over.id as string) ?? `sa${n++}`, vault: 'personal',
  at: (over.at as string) ?? '2026-08-03T12:00:00.000Z',
  device: (over.device as string) ?? 'd0', seq: (over.seq as number) ?? n,
  kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);
// One GLOBAL seq and zero-padded ids. The first version gave each ctx() its own
// counter starting at 1000, so a settle and the untrash after it carried the
// SAME (at, device, seq) — and the tie-break is the id, where an unpadded
// 'sc10' sorts BELOW 'sc9'. The untrash lost the LWW race against the trash it
// was undoing, in the test only: the app's session hands out monotonic seqs.
let gseq = 1000;
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => gseq++, id: () => `sc${String(n++).padStart(6, '0')}`,
});

// --- F4: the fold's one aliasing hole ----------------------------------------

test('seam-f4: folding a settle on top of a state never mutates that state', () => {
  let base = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'pebble', title: 'the roof' })]);
  base = write(base, [ev('pebble.raised', 'P', { magnitude: 'boulder', affects: [] })]);
  const before = base.nodes.get('P')!.pebble;
  assert.ok(before, 'fixture: the weight is on');
  // The old `pebble.settled` case wrote `n.pebble = null` through `s.nodes.get`
  // without `ensureNode` — the fold's ONE bypass of copy-on-write, so a
  // REJECTED batch containing a settle left the settle applied to live state.
  fold([ev('pebble.settled', 'P', {})], base);
  assert.equal(base.nodes.get('P')!.pebble, before,
    'the base state was mutated by folding on top of it — the copy-on-write contract is broken');
});

// --- F9: "Keep it after all" on a settled pebble ----------------------------

test('seam-f9: a settled pebble kept after all is BACK on the load list, weight intact', () => {
  let s = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'pebble', title: 'the roof' })]);
  s = write(s, [ev('pebble.raised', 'P', { magnitude: 'rock', affects: [] })]);
  s = write(s, settlePebbleEvents(ctx(), 'P'));
  assert.equal(loadNow(s).pebbles.length, 0, 'settled: off the load list');
  assert.ok(s.nodes.get('P')!.trashed, 'and in the trash, which is the way back (ADR-0065)');

  s = write(s, untrashEvents(ctx(), 'P'));
  // Before 1.17.3 the settle nulled the weight, so "Keep it after all" said
  // "Kept." and the node then appeared on NO surface at all — not the load
  // list, not search, not the todo list, not the trash.
  const back = loadNow(s).pebbles;
  assert.equal(back.length, 1, 'kept after all, and stranded on no surface');
  assert.equal(back[0]!.pebble!.magnitude, 'rock', 'with the weight it had');
  assert.equal(silentNodes(s).length, 0);
});

// --- F2 + F5: a worry is not work --------------------------------------------

test('seam-f2: an unanswered worry is never offered as the next thing to do', () => {
  assert.ok(NOT_ACTIONABLE.has('bother'), 'kinds.ts rules a worry out of the queue');
  let s = write(emptyState(), [ev('bother.received', 'B', { text: 'the noise upstairs' })]);
  assert.ok(!nextUpQueue(s, NOW, TZ).some(q => q.node.id === 'B'),
    'a fresh worry was offered on the work surface with a Done button, before "whose is this?" was asked');
});

test('seam-f5: the bother cure is the app\'s clock, not an arrived demand', () => {
  // A cure inherits the intent of the event it cured (isAppClock's own
  // doctrine), and a worry entering carries no intent about WHEN. Before
  // 1.17.3 only `gate:node.created` was exempt, so the bother cure read as
  // "this one is waiting" — and a routed (tracked or declined) worry sat under
  // "Ready now" for ever, the nag ADR-0056 removed rebuilt in the todo list.
  assert.equal(isAppClock({ kind: 'review', at: NOW, source: 'gate:bother.received' } as never), true);
  // The demand cures STAY demands — the "any gate:" mistake the comment
  // records must not be reopened.
  assert.equal(isAppClock({ kind: 'review', at: NOW, source: 'gate:menu.item.promoted' } as never), false);
  assert.equal(isAppClock({ kind: 'review', at: NOW, source: 'gate:clarify.routed' } as never), false);

  let s = write(emptyState(), [ev('bother.received', 'B', { text: 'the letter' })]);
  s = write(s, [ev('bother.owned', 'B', { ownership: 'not-mine-to-carry' })]);
  s = write(s, [
    ev('bother.routed', 'B', { park: true }),
    ev('request.declined', 'B', { person: null, what: 'the letter', reason: 'bother' }),
    ev('park.set', 'B', { returnAt: '2026-08-24T23:59:59.000Z', reason: 'not-now-ledger' }),
  ]);
  const group = heldGroups(s, NOW, TZ).find(g => g.items.some(x => x.id === 'B'));
  assert.ok(group, 'still held — a decline is never hidden');
  assert.equal(group!.key, 'later',
    `ADR-0056 promises the ledger's parked decline "sits quietly in Later... never asking" — it is under "${group!.key}"`);
});

// --- F6: the merge picker and the not-work kinds ----------------------------

test('seam-f6: nothing folds into a journal entry or an anchor, and neither folds into anything', () => {
  let s = write(emptyState(), [
    ev('node.created', 'W', { nodeKind: 'action', title: 'real work' }),
    ev('node.created', 'J', { nodeKind: 'journal', title: '' }),
  ]);
  s = write(s, [ev('anchor.defined', 'A', { name: 'the staff call', recurrence: '' })]);
  const forWork = legalMergeTargets(s, s.nodes.get('W')!);
  // Before 1.17.3 a titleless journal sorted FIRST in the picker, as
  // "(untitled)" at the very top — and accepting it hid the work from every
  // surface while the gauge still read zero, because law 1 rides the merge
  // chain to a demand-free survivor.
  assert.ok(!forWork.some(t => t.kind === 'journal'), 'a private entry is offered as a fold survivor');
  assert.ok(!forWork.some(t => t.kind === 'anchor'), 'a named period is offered as a fold survivor');
  assert.deepEqual(legalMergeTargets(s, s.nodes.get('J')!), [], 'and a journal folds into nothing');
  assert.deepEqual(legalMergeTargets(s, s.nodes.get('A')!), [], 'and an anchor folds into nothing');
});

// --- F8: trash on a merge survivor is never offered --------------------------

test('seam-f8: bulk let-go skips a merge survivor rather than promising what the gate refuses', () => {
  let s = write(emptyState(), [
    ev('node.created', 'X', { nodeKind: 'action', title: 'dup' }),
    ev('node.created', 'Y', { nodeKind: 'action', title: 'survivor' }),
  ]);
  s = write(s, [ev('node.merged', 'X', { into: 'Y' })]);
  assert.equal(eligible('let-go', s.nodes.get('Y'), s, {}), false,
    'the preview counts a survivor the gate will refuse mid-batch');
  const plain = write(emptyState(), [ev('node.created', 'Z', { nodeKind: 'action', title: 'own thing' })]);
  assert.equal(eligible('let-go', plain.nodes.get('Z'), plain, {}), true,
    'while an ordinary node is still eligible');
});

// --- F12: a closed wait does not block the carry -----------------------------

test('seam-f12: folding an open wait into a survivor whose wait CLOSED carries it', () => {
  let s = write(emptyState(), [
    ev('node.created', 'SRC', { nodeKind: 'waiting-for', title: 'the quote' }),
    ev('node.created', 'DST', { nodeKind: 'waiting-for', title: 'quote (dup)' }),
  ]);
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('waiting.opened', 'SRC', { person: 'ADA', forWhat: 'the written quote', since: NOW })]);
  s = write(s, [ev('waiting.opened', 'DST', { person: 'ADA', forWhat: 'the quote', since: NOW })]);
  s = write(s, [ev('waiting.closed', 'DST', { outcome: 'it arrived, wrong version' })]);

  const plan = mergePlan(ctx(), s, s.nodes.get('SRC')!, s.nodes.get('DST')!);
  // `waiting.closed` sets waitingOutcome but never clears waitingOn, and the
  // old test was bare `!target.waitingOn` — so a survivor whose wait had
  // ANSWERED blocked the carry, and the source's still-open wait vanished from
  // "with other people" with no record anywhere. The disposition's own words
  // are "when the survivor has no OPEN waiting".
  assert.ok(plan.events.some(e => e.kind === 'waiting.opened' && e.node === 'DST'),
    'the open wait was swallowed because the survivor once had a wait that already closed');
});

// --- F13: decline is never offered on a demand-free kind ---------------------

test('seam-f13: declining a demand-free kind is refused by the gate — so it must not be offered', () => {
  let s = write(emptyState(), [ev('anchor.defined', 'A', { name: 'the staff call', recurrence: '' })]);
  // The batch a decline writes carries a park, and a park on a demand-free
  // kind is refused. The sheet's canDecline now excludes DEMAND_FREE_KINDS;
  // this pins the gate half so the pair cannot drift.
  assert.throws(
    () => admit(declinePair(ctx(), s, 'A', 'the staff call', null, 'detail'), s, gateOptionsFor(TZ)),
    /cannot carry a clock/i,
  );
});

// --- F7: the calendar carries no nags ----------------------------------------

test('seam-f7: a standing decline and a worry never reach the exported calendar', () => {
  let s = write(emptyState(), [ev('node.created', 'W', { nodeKind: 'action', title: 'declined thing' })]);
  s = write(s, [ev('person.created', 'SAM', { name: 'Sam' })]);
  s = write(s, declinePair(ctx(), s, 'W', 'declined thing', 'SAM', 'detail'));
  assert.ok(s.nodes.get('W')!.notNow, 'fixture: the decline stands');
  assert.equal(exportsToCalendar(s.nodes.get('W')!), false);
  const ics = toCalendar(s, NOW, TZ);
  // Before 1.17.3 the decline's park exported as an all-day event with a 9 am
  // alarm — the OS rebuilding, in the diary you trust, the exact nag ADR-0056
  // removed, about the very thing you said no to.
  assert.equal(ics.includes('UID:W@quietkeep'), false, 'the decline is in the diary with an alarm');
  assert.equal(calendarCount(s, NOW, TZ), 0, 'and the stated count agrees with the file');
});

// --- F1: the report never discloses the not-work kinds -----------------------

test('seam-f1: journal entries, pebbles, people and anchors never enter the status report', () => {
  const before = fold([]);
  let s = write(emptyState(), [ev('node.created', 'J', { nodeKind: 'journal', title: '' })]);
  s = write(s, [ev('journal.entry.written', 'J', { v: 1, iv: 'aa', ct: 'Q1lQSEVSVEVYVA' })]);
  s = write(s, [ev('node.created', 'P', { nodeKind: 'pebble', title: 'the roof' })]);
  s = write(s, [ev('pebble.raised', 'P', { magnitude: 'rock', affects: [] })]);
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('anchor.defined', 'A', { name: 'the staff call', recurrence: '' })]);
  s = write(s, [ev('node.created', 'W', { nodeKind: 'action', title: 'real work' })]);

  const r = deltaBetween(before, s, null, NOW, TZ);
  // The report is the one document that leaves the device for another person's
  // eyes. It itemised private journal entries as "New — (untitled)", and
  // pebbles, people and anchors as new work.
  assert.deepEqual(r.changes.map(c => c.node.id).sort(), ['W'],
    'a private entry, a weight, a person or a period was reported to another person');
});

// --- F3: the paper and the screen are one projection -------------------------

test('seam-f3: the printed card never offers what the screen holds back', () => {
  let s = write(emptyState(), [ev('node.created', 'L', { nodeKind: 'action', title: 'lapsed thing' })]);
  s = write(s, [ev('clock.set', 'L', { clockKind: 'due', at: '2026-07-20T23:59:59.000Z', source: 'me' })]);
  s = write(s, [ev('node.created', 'OK', { nodeKind: 'action', title: 'ordinary thing' })]);
  s = write(s, [ev('clock.set', 'OK', { clockKind: 'due', at: '2026-08-03T23:59:59.000Z', source: 'me' })]);

  const screen = workSurface(s, NOW, TZ).up;
  const paper = todayCard(s, NOW, TZ);
  // The card's docstring promised "the SAME projections the screen uses" while
  // calling the raw queue — so a passed date the screen shows only as a replan
  // DECISION (law 3) was printed as the one thing to do.
  const paperIds = [paper.head?.title, ...paper.also].filter(Boolean);
  assert.ok(!paperIds.includes('lapsed thing'),
    'the paper offers a lapsed commitment as ordinary work while the screen shows a decision');
  assert.equal(paper.head?.title, screen.head?.node.title, 'one definition of "the one thing"');
});
