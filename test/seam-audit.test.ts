// The seam audit's confirmed findings, pinned (1.17.3), and the audit's TAIL
// (1.17.4) — the sixteen findings that had no skeptic pass and were therefore
// verified against source WHILE being fixed. The tail's tests are the
// `seam-t*` family below; each pins one fix. Each test here carries its
// finding's number, so the defect cannot return without a named test going
// red. The convention is `audit-regressions.test.ts` from 1.9.2:
// family-prefixed names, one seam per test.

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
import { parseTaskPaper, importSummary, taskPaperEvents } from '../src/taskpaper.ts';
import { purgeCount, purgeSummary, purgeWords } from '../src/purge.ts';
import { menuCount, menuGroups } from '../src/menu.ts';
import { greetEvents } from '../src/ui/reentry-intents.ts';
import { routeBotherEvents } from '../src/ui/bother-intents.ts';
import { declareFeedsEvents } from '../src/ui/detail-intents.ts';
import { ledgerRowWords, notNowLedger, standingDecline } from '../src/requests.ts';
import { canHold } from '../src/ui/merge-intents.ts';
import { anchorWords } from '../src/anchors.ts';
import { daysWords, everyDaysWords, recordDayWords } from '../src/time.ts';
import { renderCsv, renderMarkdown, type DeltaReport } from '../src/delta.ts';
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

test('seam-f1: nothing that is not work enters the status report', () => {
  const before = fold([]);
  let s = write(emptyState(), [ev('node.created', 'J', { nodeKind: 'journal', title: '' })]);
  s = write(s, [ev('journal.entry.written', 'J', { v: 1, iv: 'aa', ct: 'Q1lQSEVSVEVYVA' })]);
  s = write(s, [ev('node.created', 'P', { nodeKind: 'pebble', title: 'the roof' })]);
  s = write(s, [ev('pebble.raised', 'P', { magnitude: 'rock', affects: [] })]);
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('anchor.defined', 'A', { name: 'the staff call', recurrence: '' })]);
  // THE ONE THIS TEST WAS BLIND TO, and the reason the deny-list became a total
  // record. `bother` was in NOT_ACTIONABLE and NO_REPLAN_CARD and was NOT in
  // NOT_REPORTABLE, so a worry — the flow whose whole pitch is that you may put
  // a private thing down AS a worry rather than as a task — was itemised under
  // "New", by name, verbatim, in the one artefact built to be handed to somebody
  // else. The four kinds the 1.17.3 audit found were enumerated; the question
  // was never asked over the vocabulary.
  s = write(s, [ev('bother.received', 'B', { text: 'the letter I have not opened' })]);
  s = write(s, [ev('node.created', 'W', { nodeKind: 'action', title: 'real work' })]);

  const r = deltaBetween(before, s, null, NOW, TZ);
  assert.deepEqual(r.changes.map(c => c.node.id).sort(), ['W'],
    'a private entry, a weight, a person, a period or a worry was reported to another person');
  // Named, because the failure mode is a title appearing verbatim in a document
  // somebody else reads — a count would not have caught the shape.
  assert.ok(!JSON.stringify(r).includes('the letter I have not opened'),
    'a worry reached the report in its own words');
});

test('seam-f1b: the report asks the question over the WHOLE vocabulary', () => {
  // The deny-list could only be wrong in one direction — silently, by omission,
  // for any kind added after it was written. A total record cannot be
  // under-populated: this asserts the shape holds rather than re-listing the
  // kinds, so adding a noun to NODE_KINDS fails to compile until somebody
  // decides in writing whether it may leave the device.
  const before = fold([]);
  let s = emptyState();
  for (const k of ['aspiration', 'resume-card'] as const) {
    s = write(s, [ev('node.created', k.toUpperCase(), { nodeKind: k, title: `a ${k}` })]);
  }
  const r = deltaBetween(before, s, null, NOW, TZ);
  assert.deepEqual(r.changes, [],
    'a want on the Menu or the app’s own resume card was reported as work somebody did');
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

// ============================================================================
// The tail (1.17.4): the audit's sixteen unverified findings, fixed under test.
// Ten carried code; the six record-drift findings are docs-only and need none.
// ============================================================================

// --- T1: the import summary counts notes the way the mapper writes them ------

test('seam-t1: consecutive note lines are ONE note, and the summary says so', () => {
  const text = [
    'Trip:',
    '\t- Book the ferry',
    '\t\tcall after nine',
    '\t\tthe direct line is faster',
    '\t- Pack the charger',
    '\t\tthe white one',
  ].join('\n');
  const { lines, unreadable } = parseTaskPaper(text);
  const s = importSummary(lines, unreadable, NOW, TZ);
  // Three note LINES, two joined notes. The count used to say 3 — "3 notes
  // come across" for a file whose import writes 2 `node.field.set`s.
  assert.equal(s.notes, 2, 'the summary counts joined notes, not lines');
  const written = taskPaperEvents(ctx(), lines)
    .filter(e => e.kind === 'node.field.set' && (e.payload as { field?: string }).field === 'note');
  assert.equal(s.notes, written.length,
    'the stated count and the events the mapper writes are the same number');
});

// --- T2: the purge number names what it counts -------------------------------

test('seam-t2: purge words name the wide count, beside the gauge\'s narrow one', () => {
  // A store where the two "things" numbers genuinely differ: one work item,
  // one person, one pebble. The gauge (heldWork) counts 2 — a pebble is load
  // and stays on the gauge's list via its own rules; a person is not work.
  let s = write(emptyState(), [ev('node.created', 'W', { nodeKind: 'action', title: 'real work' })]);
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('node.created', 'J', { nodeKind: 'journal', title: '' })]);
  const wide = purgeCount(s, []).things;
  const narrow = coverageGauge(s).total;
  assert.ok(wide > narrow, `fixture: the two numbers differ (${wide} vs ${narrow})`);
  // The fix is WORDS: wherever the wide number is rendered, it says what it
  // counts, so the panel cannot show two unexplained "things" numbers.
  const summary = purgeSummary(purgeCount(s, []));
  assert.match(summary, /people, weights and private entries included/);
  const confirm = purgeWords('clear', purgeCount(s, []), false);
  assert.match(confirm, /people, weights and private entries included/);
  assert.match(confirm, /not only the work the gauge counts/);
});

// --- T3: the Menu's number is the sum of its rows ----------------------------

test('seam-t3: an onMenu value outside the closed list renders nowhere and counts nowhere', () => {
  let s = write(emptyState(), [ev('node.created', 'M', { nodeKind: 'aspiration', title: 'learn the fiddle' })]);
  s = write(s, [ev('menu.item.added', 'M', { category: 'read' })]);
  assert.equal(menuCount(s), 1, 'fixture: an ordinary Menu item counts');
  // A category from outside the closed list — an import from a newer edition.
  // Straight through `fold`, as a foreign shard would arrive.
  const foreign = fold([ev('node.created', 'X', { nodeKind: 'aspiration', title: 'from the future' }),
    ev('menu.item.added', 'X', { category: 'someday-2' })], s);
  const rendered = menuGroups(foreign).reduce((t, g) => t + g.items.length, 0);
  // Before 1.17.4 menuCount said 2 while the Menu rendered 1 row.
  assert.equal(menuCount(foreign), rendered,
    'the Menu\'s stated count disagrees with the rows it renders');
});

// --- T4: reentry.greeted records what the emitter actually says --------------

test('seam-t4: the greeting records WHETHER, never WHICH — and the cap holds', () => {
  const [greet] = greetEvents(ctx(), 12, 5);
  const shown = (greet!.payload as { shown: { nextUp: unknown; triage: unknown; gauge: unknown } }).shown;
  // The declaration claimed {nextUp: NodeId|null, triage: NodeId[], gauge:
  // number} — node ids in a greeting. The emitter has always written the
  // privacy-better shape, and the declaration now matches it.
  assert.equal(typeof shown.nextUp, 'boolean', 'whether Next-up was shown, never which node');
  assert.equal(typeof shown.gauge, 'boolean');
  assert.equal(shown.triage, 3, 'a count, capped by schema at three');
});

// --- T5: bother.routed's declared union is the one the emitters write --------

test('seam-t5: every bother route writes {route:"inbox"} or {park:true}, nothing else', () => {
  let s = write(emptyState(), [ev('bother.received', 'B', { text: 'the noise' })]);
  s = write(s, [ev('bother.owned', 'B', { ownership: 'mine-to-solve' })]);
  for (const own of ['mine-to-solve', 'mine-to-track', 'not-mine-to-carry'] as const) {
    const routed = routeBotherEvents(ctx(), s, 'B', own)
      .filter(e => e.kind === 'bother.routed');
    assert.equal(routed.length, 1, `${own}: exactly one routing record`);
    const p = routed[0]!.payload;
    // The old declaration said {route: ClarifyRoute | 'park'} — a shape no
    // emitter ever wrote ('inbox' is not even a ClarifyRoute).
    assert.ok(
      JSON.stringify(p) === '{"route":"inbox"}' || JSON.stringify(p) === '{"park":true}',
      `${own} wrote ${JSON.stringify(p)} — outside the declared union`);
  }
});

// --- T6: dependency.declared carries no meaningless timestamp ----------------

test('seam-t6: declaring an edge writes no suspense, and a bare edge is legal', () => {
  let s = write(emptyState(), [
    ev('node.created', 'UP', { nodeKind: 'action', title: 'order the glass' }),
    ev('node.created', 'DOWN', { nodeKind: 'action', title: 'fit the window' }),
  ]);
  const declared = declareFeedsEvents(ctx(), 'UP', 'DOWN', 5);
  // The builder used to fill `suspense` with its own stamp time — a value no
  // fold case reads and no clock comes from, required only by a wrong type.
  assert.ok(!('suspense' in (declared[0]!.payload as Record<string, unknown>)),
    'the builder still writes the meaningless timestamp');
  s = write(s, declared);
  assert.equal(s.nodes.get('UP')!.leadDays, 5);
  // The merge-carried shape — feeds alone, no lead — is an ordinary payload,
  // not a malformed one, and folds without inventing a lead.
  s = write(s, [ev('node.created', 'SIDE', { nodeKind: 'action', title: 'order the sealant' })]);
  const bare = write(s, [ev('dependency.declared', 'SIDE', { feeds: 'DOWN' })]);
  assert.deepEqual(bare.nodes.get('SIDE')!.feeds, ['DOWN']);
  assert.equal(bare.nodes.get('SIDE')!.leadDays, null);
});

// --- T7: done-then-undone keeps the standing decline -------------------------

test('seam-t7: completing a declined thing settles the decline; undoing brings it back', () => {
  let s = write(emptyState(), [ev('node.created', 'D', { nodeKind: 'action', title: 'the survey' })]);
  s = write(s, declinePair(ctx(), s, 'D', 'the survey', null, 'detail'));
  assert.equal(notNowLedger(s).length, 1, 'fixture: the decline stands');

  // LATER than the decline (declinePair stamps NOW = 18:00) — the completion
  // must be the newer decision for it to settle the decline.
  s = write(s, [ev('done.marked', 'D', { at: '2026-08-03T19:00:00.000Z' }, { at: '2026-08-03T19:00:00.000Z' })]);
  assert.equal(notNowLedger(s).length, 0, 'a completed thing is not a declined thing (ADR-0056)');
  assert.equal(standingDecline(s.nodes.get('D')!), null, 'and every surface asks the same predicate');

  s = write(s, [ev('done.unmarked', 'D', {}, { at: '2026-08-03T20:00:00.000Z' })]);
  // Before 1.17.4 the fold NULLED the record on done.marked while undone
  // restored only lastDone — so this row was gone for ever, though the log
  // still held the decline.
  assert.equal(notNowLedger(s).length, 1, 'undone dropped a standing decline permanently');
  // And the other direction: declining AFTER a completion stands.
  let t = write(emptyState(), [ev('node.created', 'E', { nodeKind: 'action', title: 'the audit' })]);
  t = write(t, [ev('done.marked', 'E', { at: '2026-08-03T10:00:00.000Z' }, { at: '2026-08-03T10:00:00.000Z' })]);
  t = write(t, declinePair(ctx(), t, 'E', 'the audit', null, 'detail'));
  assert.equal(notNowLedger(t).length, 1, 'a decline made after an old completion stands');
});

// --- T8: the picker and the carry agree about the decline's park -------------

test('seam-t8: a source whose only clock is its decline\'s park may fold into a wish', () => {
  let s = write(emptyState(), [
    ev('node.created', 'SRC', { nodeKind: 'action', title: 'their request' }),
    ev('node.created', 'ASP', { nodeKind: 'aspiration', title: 'the same wish, said once' }),
  ]);
  s = write(s, declinePair(ctx(), s, 'SRC', 'their request', null, 'detail'));
  const src = s.nodes.get('SRC')!, asp = s.nodes.get('ASP')!;
  assert.ok(src.clocks.park && src.notNow, 'fixture: the decline and its park are on');
  // `mergePlan` deliberately never carries the decline's park — so there is
  // nothing the aspiration would be asked to hold, and withholding it was the
  // picker refusing a fold the gate accepts.
  assert.equal(canHold(asp, src), true,
    'the picker withholds a legal target because it counts a park the carry skips');
  assert.ok(legalMergeTargets(s, src).some(t => t.id === 'ASP'), 'and the picker offers it');
  const plan = mergePlan(ctx(), s, src, asp);
  assert.ok(!plan.events.some(e => e.kind === 'park.set'),
    'parity: the carry indeed skips the decline\'s park');
  const committed = write(s, plan.events);
  assert.equal(silentNodes(committed).length, 0, 'and the fold lands with law 1 intact');
});

// --- T9: a record date a year away says which year ---------------------------

test('seam-t9: ledger rows, the anchor line and record day words carry the far year', () => {
  assert.match(recordDayWords('2036-09-01T12:00:00.000Z', TZ, NOW), /2036/,
    'a far future day must say which year');
  assert.match(recordDayWords('2024-08-01T12:00:00.000Z', TZ, NOW), /2024/,
    'a record from another year must say which year');
  assert.doesNotMatch(recordDayWords('2026-08-10T12:00:00.000Z', TZ, NOW), /2026/,
    'a near day stays short');

  // The ledger row, through the same helper.
  let s = write(emptyState(), [ev('node.created', 'L', { nodeKind: 'action', title: 'old request' })]);
  s = write(s, [
    ev('request.declined', 'L', { person: null, what: 'old request', reason: 'detail' }, { at: '2024-08-01T12:00:00.000Z' }),
    ev('park.set', 'L', { returnAt: '2026-08-24T23:59:59.000Z', reason: 'not-now-ledger' }, { at: '2024-08-01T12:00:00.000Z' }),
  ]);
  const row = notNowLedger(s)[0]!;
  assert.match(ledgerRowWords(row, () => null, TZ, NOW), /2024/,
    'a decline recorded two years ago reads as this year\'s');

  // The anchor line, through the same helper.
  let a = write(emptyState(), [ev('anchor.defined', 'A', { name: 'the staff call', recurrence: '' })]);
  const words = anchorWords(a.nodes.get('A')!, { at: '2025-06-05T12:00:00.000Z', mark: null }, '', TZ, NOW);
  assert.match(words, /2025/, 'a firing from last year reads as this year\'s');
});

// --- T10: interval and duration words go singular at one ---------------------

test('seam-t10: "every day" and "1 day", never "every 1 days" or "1 days"', () => {
  assert.equal(everyDaysWords(1), 'every day');
  assert.equal(everyDaysWords(3), 'every 3 days');
  assert.equal(daysWords(1), '1 day');
  assert.equal(daysWords(14), '14 days');
  // The report's outstanding row — the rendered path that shipped "1 days".
  const r: DeltaReport = {
    since: null, changes: [],
    outstanding: [{ node: { id: 'W', title: 'the quote' } as never, whom: 'Ada', days: 1 }],
    ahead: [], decided: [],
  };
  assert.ok(!renderCsv(r, TZ).includes('1 days'), 'the CSV report still says "1 days"');
  assert.ok(!renderMarkdown(r, TZ).includes('1 days'), 'the markdown report still says "1 days"');
});
