// The track portfolio and the delta report (v1 Must).
//
// Two claims carry weight here. One: a tracked project must NOT put work in
// front of you, because you are not the one doing it. Two: the report is
// fold(log up to then) vs fold(log) — so it cannot drift, and it must be
// byte-identical for the same pair of states however many times it is run.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import { trackPortfolio, trackWords, portfolioWords, isTracked } from '../src/portfolio.ts';
import {
  statusReport, renderMarkdown, renderCsv, renderText, periodWords, reportedBefore,
} from '../src/delta.ts';
import { highWaterMark } from '../src/snapshot.ts';
import { nextUp } from '../src/nextup.ts';
import { waitingOnAnyone } from '../src/people.ts';
import { setTrackRoleEvents, setSuspenseEvents, linkPersonEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const AGO = (d: number): string => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();
const ON = (d: number): string => new Date(Date.parse(NOW) + d * 86_400_000).toISOString();

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...e: AppEvent[]): State => fold(e);
const mk = (id: string, kind: string, title = id, parent?: string): AppEvent =>
  ev('node.created', id, { nodeKind: kind, title, ...(parent ? { parent } : {}) });
const clocked = (id: string, at = NOW): AppEvent =>
  ev('clock.set', id, { clockKind: 'review', at, source: 't' });

const ctx = {
  id: () => `x${seq++}`, vault: 'personal', at: NOW, device: 'd0', seq: () => seq++, zone: TZ,
};
/** Stamped explicitly, so a shard's device and seq can be set. */
const mkAt = (id: string, title: string, at: string, device: string, sq: number): AppEvent =>
  ({ id: `${device}-${sq}`, vault: 'personal', at, device, seq: sq,
     kind: 'node.created', node: id, payload: { nodeKind: 'action', title } } as AppEvent);
const ckAt = (id: string, at: string, device: string, sq: number): AppEvent =>
  ({ id: `${device}-${sq}`, vault: 'personal', at, device, seq: sq,
     kind: 'clock.set', node: id, payload: { clockKind: 'review', at: NOW, source: 't' } } as AppEvent);

const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

// --- carrying rather than doing ---------------------------------------------

test('THE LOAD-BEARING ONE: a tracked project puts no work in front of you', () => {
  // Offering a next action on something somebody else is executing is the app
  // telling you to do their job — on the surface whose entire promise is that it
  // has already decided for you.
  const base = st(
    mk('P', 'project', 'the migration'), clocked('P'),
    mk('A', 'action', 'write the script', 'P'), clocked('A'),
  );
  assert.equal(nextUp(base, NOW, TZ).head?.node.id, 'A', 'yours to do: offered');

  const tracked = apply(base, setTrackRoleEvents(ctx, 'P', 'track'));
  const offered = [tracked].flatMap(s => {
    const u = nextUp(s, NOW, TZ);
    return [u.head, ...u.behind].filter(Boolean).map(x => x!.node.id);
  });
  assert.equal(offered.includes('A'), false, 'carried by you: not offered');
});

test('but chasing IS the work, so a waiting-for under it is still surfaced', () => {
  // NOT via Next up. `waiting-for` is in NOT_ACTIONABLE and has been since that
  // set existed — Next up never offers one, tracked or otherwise, because "wait
  // for Ada" is not a next step you can take. The surface that owns chasing is
  // the person lens, and the tracking exclusion must not swallow it there.
  const s = apply(st(
    mk('P', 'project'), clocked('P'), mk('p1', 'person', 'Ada'),
    mk('W', 'waiting-for', 'the numbers from Ada', 'P'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'the numbers', since: AGO(4) }),
  ), setTrackRoleEvents(ctx, 'P', 'track'));
  assert.deepEqual(waitingOnAnyone(s, NOW, TZ).map(l => l.node.id), ['W'],
    'the one thing you CAN do about it is still in front of you');
  assert.deepEqual(trackPortfolio(s, NOW, TZ)[0]!.waiting.map(w => w.node.id), ['W'],
    'and the portfolio line counts it as outstanding');
});

test('the exclusion reaches all the way down, not one level', () => {
  const s = apply(st(
    mk('P', 'project'), clocked('P'),
    mk('S', 'project', 'a sub-part', 'P'), clocked('S'),
    mk('A', 'action', 'buried work', 'S'), clocked('A'),
  ), setTrackRoleEvents(ctx, 'P', 'track'));
  const u = nextUp(s, NOW, TZ);
  assert.equal([u.head, ...u.behind].filter(Boolean).some(x => x!.node.id === 'A'), false);
});

test('an ancestor walk over an already-cyclic graph terminates', () => {
  const s = st(mk('A', 'project'), clocked('A'), mk('B', 'project'), clocked('B'));
  s.nodes.get('A')!.parent = 'B';
  s.nodes.get('B')!.parent = 'A';
  assert.doesNotThrow(() => nextUp(s, NOW, TZ), 'a shard can deliver half a loop (ADR-0035)');
});

test('only containers are tracked, and only while unfinished', () => {
  const p = apply(st(mk('P', 'project'), clocked('P')), setTrackRoleEvents(ctx, 'P', 'track'));
  assert.equal(isTracked(p.nodes.get('P')!), true);
  assert.equal(trackPortfolio(p, NOW, TZ).length, 1);

  const done = apply(p, [ev('done.marked', 'P', { at: NOW })]);
  assert.deepEqual(trackPortfolio(done, NOW, TZ), [], 'a finished one is not still carried');

  const back = apply(p, setTrackRoleEvents(ctx, 'P', 'execute'));
  assert.deepEqual(trackPortfolio(back, NOW, TZ), [], 'and taking it back removes it');
});

test('soonest answer owed leads; no date at all sits last', () => {
  let s = st(
    mk('A', 'project'), clocked('A'), mk('B', 'project'), clocked('B'), mk('C', 'project'), clocked('C'),
  );
  for (const id of ['A', 'B', 'C']) s = apply(s, setTrackRoleEvents(ctx, id, 'track'));
  s = apply(s, [ev('suspense.set', 'A', { at: ON(20) })]);
  s = apply(s, [ev('suspense.set', 'B', { at: ON(2) })]);
  assert.deepEqual(trackPortfolio(s, NOW, TZ).map(l => l.node.id), ['B', 'A', 'C'],
    'C has no date — not more relaxed, just not asking today');
});

test('a suspense set through the sheet lands as a clock, in the local day', () => {
  const s0 = st(mk('P', 'project'), clocked('P'));
  const s1 = apply(s0, setSuspenseEvents(ctx, 'P', '2026-08-14'));
  const c = s1.nodes.get('P')!.clocks.suspense!;
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(c.at)), '2026-08-14',
    'the END of that day in the user’s zone, not UTC’s (V-13)');
});

test('what it says is facts and never a grade', () => {
  const s = apply(st(
    mk('P', 'project'), clocked('P'), mk('p1', 'person', 'Ada'),
    mk('W', 'waiting-for', 'the numbers', 'P'), clocked('W'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'the numbers', since: AGO(9) }),
    ev('opr.assigned', 'P', { person: 'p1' }),
    ev('suspense.set', 'P', { at: ON(3) }),
  ), setTrackRoleEvents(ctx, 'P', 'track'));
  const words = trackWords(trackPortfolio(s, NOW, TZ)[0]!);
  assert.match(words, /Ada is running it/);
  assert.match(words, /an answer is due in 3 days/);
  assert.match(words, /one thing outstanding/);
  // The temptation on a portfolio surface is a health word. Every one of them is
  // this app grading somebody else's work on evidence it does not have.
  for (const grade of ['at risk', 'slipping', 'stalled', 'behind', 'late', 'overdue', 'red', 'amber', 'healthy', 'on track']) {
    assert.doesNotMatch(words, new RegExp(grade, 'i'), `"${words}" grades nobody`);
  }
});

test('nobody named is reported, not hidden', () => {
  // A tracked thing with no owner is the classic way something quietly stops
  // being anybody's.
  const s = apply(st(mk('P', 'project'), clocked('P')), setTrackRoleEvents(ctx, 'P', 'track'));
  assert.match(trackWords(trackPortfolio(s, NOW, TZ)[0]!), /nobody named yet/);
});

test('the count is a number of things carried, never a workload score', () => {
  assert.equal(portfolioWords(0), '');
  assert.equal(portfolioWords(1), 'One thing you are carrying rather than doing.');
  assert.equal(portfolioWords(4), '4 things you are carrying rather than doing.');
});

// --- the report -------------------------------------------------------------

const before = st(
  mk('A', 'action', 'the report'), clocked('A'),
  mk('W', 'waiting-for', 'the signed form'), clocked('W'),
  mk('p1', 'person', 'Sam'),
  ev('waiting.opened', 'W', { person: 'p1', forWhat: 'the signed form', since: AGO(9) }),
);
const after = fold([
  ev('done.marked', 'A', { at: NOW }),
  mk('N', 'action', 'something new'), clocked('N'),
  ev('waiting.closed', 'W', { outcome: 'arrived' }),
  mk('D', 'action', 'the thing on Friday'), ev('clock.set', 'D', { clockKind: 'due', at: ON(3), source: 't' }),
], before);

test('the delta is computed from the log, so nothing has to be kept up to date', () => {
  const r = statusReport(before, after, AGO(1), NOW, TZ);
  const by = (k: string) => r.changes.filter(c => c.kind === k).map(c => c.node.id);
  assert.deepEqual(by('finished'), ['A']);
  assert.deepEqual(by('arrived'), ['W']);
  assert.deepEqual(by('new').sort(), ['D', 'N']);
  assert.deepEqual(r.ahead.map(a => a.node.id), ['D'], 'and what is coming up');
  assert.deepEqual(r.outstanding, [], 'nothing is with anyone any more');
});

test('a thing begun and finished in one period is reported as FINISHED', () => {
  // "We finished it" is the useful sentence. "We started it" is not what anyone
  // wants to hear about something that is already done.
  const b = fold([]);
  const a = fold([mk('X', 'action', 'quick job'), clocked('X'), ev('done.marked', 'X', { at: NOW })]);
  const r = statusReport(b, a, AGO(1), NOW, TZ);
  assert.deepEqual(r.changes.map(c => c.kind), ['finished']);
});

test('the same two states produce a byte-identical report, every time', () => {
  // Otherwise "what changed since last time" starts including reshuffles.
  const one = renderMarkdown(statusReport(before, after, AGO(1), NOW, TZ), TZ);
  const two = renderMarkdown(statusReport(before, after, AGO(1), NOW, TZ), TZ);
  assert.equal(one, two);
});

test('nothing to report is said plainly, never padded', () => {
  const s = fold([]);
  const r = statusReport(s, s, AGO(1), NOW, TZ);
  assert.match(renderMarkdown(r, TZ), /Nothing to report\./);
  assert.match(renderText(r, TZ), /Nothing to report\./);
  assert.match(renderCsv(r, TZ), /Nothing to report\./);
});

test('the first report of all says what it really is', () => {
  assert.equal(periodWords(null, TZ), 'Everything so far');
  assert.equal(periodWords('nonsense', TZ), 'Everything so far',
    'and an unreadable mark is not silently treated as a date');
  assert.match(periodWords('2026-07-20T18:00:00.000Z', TZ), /Since 2026-07-20/);
});

test('CSV survives a title someone actually typed', () => {
  const s = fold([
    mk('X', 'action', 'call "Bob", re: budget\nand the thing'), clocked('X'),
    ev('done.marked', 'X', { at: NOW }),
  ]);
  const csv = renderCsv(statusReport(fold([]), s, null, NOW, TZ), TZ);
  assert.match(csv, /"call ""Bob"", re: budget\nand the thing"/,
    'quotes doubled, commas and newlines inside quoted cells');
  assert.equal(csv.split('\r\n')[0], '"section","item","detail"', 'CRLF, per RFC 4180');
});

test('a title starting with = is text in a spreadsheet, not a formula', () => {
  // Excel, Numbers and Sheets all evaluate it, and this file is meant to be
  // opened in one of them.
  const s = fold([mk('X', 'action', '=SUM(A1:A9)'), clocked('X'), ev('done.marked', 'X', { at: NOW })]);
  const csv = renderCsv(statusReport(fold([]), s, null, NOW, TZ), TZ);
  assert.match(csv, /"'=SUM\(A1:A9\)"/);
  for (const lead of ['+1', '-1', '@x']) {
    const t = fold([mk('Y', 'action', lead), clocked('Y'), ev('done.marked', 'Y', { at: NOW })]);
    assert.match(renderCsv(statusReport(fold([]), t, null, NOW, TZ), TZ), new RegExp(`"'\\${lead[0]}`));
  }
});

test('the report carries no rebuke, in any format', () => {
  const s = fold([
    mk('W', 'waiting-for', 'the form'), clocked('W'), mk('p1', 'person', 'Sam'),
    ev('waiting.opened', 'W', { person: 'p1', forWhat: 'the form', since: AGO(40) }),
  ]);
  const r = statusReport(fold([]), s, AGO(60), NOW, TZ);
  for (const text of [renderMarkdown(r, TZ), renderText(r, TZ), renderCsv(r, TZ)]) {
    for (const shame of ['overdue', 'late', 'missed', 'slipped', 'failed', 'chased', 'no response']) {
      assert.doesNotMatch(text, new RegExp(shame, 'i'), `"${shame}" appears in a report`);
    }
  }
});

test('the mark only ever moves forward, even when an older report arrives later', () => {
  // MAX, not last-folded. A shard arriving out of order must not wind the mark
  // back and re-report a fortnight of changes as though they were new.
  //
  // TWO FOLDS, and that is the whole point. A single `fold` sorts internally, so
  // one batch cannot tell max from last-writer — the first version of this test
  // passed against a deliberately broken `lastReportAt = e.at` and was therefore
  // checking nothing (§6 proof). Folding a second batch into an existing base is
  // exactly how a shard arrives (ADR-0035), and it is the only shape that bites.
  const recent = fold([ev('status.report.exported', null, { format: 'markdown', scope: 'all' }, AGO(1))]);
  assert.equal(recent.lastReportAt, AGO(1));

  const withOlder = fold([ev('status.report.exported', null, { format: 'csv', scope: 'all' }, AGO(9))], recent);
  assert.equal(withOlder.lastReportAt, AGO(1),
    'the older report does not wind the mark back to nine days ago');
});

test('a tracked project does not name an owner who was let go', () => {
  // FOUND BY AUDIT, 2026-07-29. The line read "Ada is running it" about
  // somebody already trashed. Worse than a missing name: it is a confident
  // wrong answer on a surface whose whole job is telling you who has what.
  const s = apply(st(
    mk('P', 'project'), clocked('P'), mk('p1', 'person', 'Ada'),
    ev('opr.assigned', 'P', { person: 'p1' }),
    ev('node.trashed', 'p1', {}),
  ), setTrackRoleEvents(ctx, 'P', 'track'));
  const line = trackPortfolio(s, NOW, TZ)[0]!;
  assert.equal(line.opr, null);
  assert.match(trackWords(line), /nobody named yet/,
    'it falls back to the honest answer, not a ghost');
});

// --- audit findings, 2026-07-29 ---------------------------------------------

test('AUDIT: a title cannot inject structure into a Markdown report', () => {
  // Titles are free text somebody typed and are stored VERBATIM by design — the
  // share target composes title/text/url with newlines, so multi-line titles are
  // normal rather than hostile. Dropped into a bullet list unchanged, one of them
  // ended the list, opened a heading, and emitted a bare "Nothing to report."
  // into a report about real work. That is a document handed to another person,
  // saying something untrue.
  const nasty = '## Finished\n- everything\n\nNothing to report.';
  const s = fold([mk('X', 'action', nasty), clocked('X'), ev('done.marked', 'X', { at: NOW })]);
  const md = renderMarkdown(statusReport(fold([]), s, null, NOW, TZ), TZ);
  const lines = md.split('\n').filter(l => l.trim());
  assert.equal(lines.filter(l => /^###? /.test(l)).length, 2,
    'exactly the two headings the report itself writes, and no injected third');
  assert.equal(lines.some(l => l.trim() === 'Nothing to report.'), false,
    'a report about real work never claims there is nothing to report');
  assert.equal(md.includes(nasty), false, 'the raw multi-line title is not pasted in');
  assert.equal(md.includes('everything'), true, 'but the content is still there, on one line');
});

test('AUDIT: work that arrived by shard is reported, even though it is older', () => {
  // "What has changed since I last told anyone" is not a question about the
  // clock. A shard union (ADR-0035) brings another device's history stamped
  // BEFORE your last report — you have never seen it and have certainly never
  // reported it, and a purely time-based cut buried it for ever.
  const mine = [
    mkAt('MINE', 'my thing', AGO(9), 'd0', 1),
    ckAt('MINE', AGO(9), 'd0', 2),
  ];
  const atReport = fold(mine);
  const report = {
    id: 'r1', vault: 'personal', at: AGO(5), device: 'd0', seq: 3,
    kind: 'status.report.exported', node: null,
    payload: { format: 'markdown', scope: 'all', upToSeqByDevice: highWaterMark(atReport) },
  } as AppEvent;
  const shard = [
    mkAt('THEIRS', 'their thing', AGO(7), 'other', 1),
    ckAt('THEIRS', AGO(7), 'other', 2),
  ];
  const log = [...mine, report, ...shard];
  const after = fold(log);
  const before = fold(reportedBefore(log, { at: after.lastReportAt, upToSeqByDevice: after.lastReportMark }));
  const r = statusReport(before, after, after.lastReportAt, NOW, TZ);
  assert.deepEqual(r.changes.map(c => c.node.id), ['THEIRS'],
    'news is news whenever it happened');
  assert.equal(r.changes.some(c => c.node.id === 'MINE'), false,
    'and what was already reported is not reported twice');
});

test('AUDIT: a report written before marks existed still works', () => {
  // Data is never lost to updates. A mark with no watermark is still a mark, and
  // it falls back to the time cut it was written under.
  const log = [
    mkAt('OLD', 'before', AGO(9), 'd0', 1), ckAt('OLD', AGO(9), 'd0', 2),
    { id: 'r0', vault: 'personal', at: AGO(5), device: 'd0', seq: 3,
      kind: 'status.report.exported', node: null,
      payload: { format: 'markdown', scope: 'all' } } as AppEvent,
    mkAt('NEW', 'after', AGO(2), 'd0', 4), ckAt('NEW', AGO(2), 'd0', 5),
  ];
  const after = fold(log);
  assert.equal(after.lastReportMark, null, 'no watermark on it');
  const before = fold(reportedBefore(log, { at: after.lastReportAt, upToSeqByDevice: after.lastReportMark }));
  const r = statusReport(before, after, after.lastReportAt, NOW, TZ);
  assert.deepEqual(r.changes.map(c => c.node.id), ['NEW'], 'and it still cuts at the right moment');
});

// --- the OPR reaches the portfolio (1.2.3 regression) ------------------------

test('REGRESSION: an OPR named through the person link reaches the portfolio', () => {
  // The live defect: the detail sheet only ever wrote person.linked{relation:
  // 'opr'}, while NodeState.opr was set only by opr.assigned — which nothing
  // emitted. So the portfolio said "nobody named yet" forever about people the
  // user HAD named. The fold now reads the link into the same LWW key, which
  // heals every log already written; this drives the exact events an existing
  // store holds.
  const s = apply(st(
    mk('P', 'project'), clocked('P'), mk('p1', 'person', 'Ada'),
    ev('person.linked', 'P', { node: 'P', person: 'p1', relation: 'opr' }),
  ), setTrackRoleEvents(ctx, 'P', 'track'));
  assert.equal(s.nodes.get('P')!.opr, 'p1', 'the link folds into NodeState.opr');
  const words = trackWords(trackPortfolio(s, NOW, TZ)[0]!);
  assert.match(words, /Ada is running it/, 'the portfolio names the person, not "nobody named yet"');
});

test('the sheet intent now emits opr.assigned alongside the link, and the two agree', () => {
  const events = linkPersonEvents(ctx, 'P', 'p1', 'opr');
  assert.ok(events.some(e => e.kind === 'opr.assigned'), 'the honest noun is written going forward');
  assert.ok(events.some(e => e.kind === 'person.linked'), 'and the link is kept for the people list');
  // Folding both together lands one answer — they share the LWW key.
  const s = fold([mk('P', 'project'), clocked('P'), mk('p1', 'person', 'Ada'), ...events]);
  assert.equal(s.nodes.get('P')!.opr, 'p1');
});

test('a stakeholder link does NOT claim to be running it', () => {
  // The healing must be scoped to the opr relation alone — a stakeholder or a
  // waiting-on link says nothing about who runs the thing.
  const s = st(
    mk('P', 'project'), clocked('P'), mk('p1', 'person', 'Ada'),
    ev('person.linked', 'P', { node: 'P', person: 'p1', relation: 'stakeholder' }),
  );
  assert.equal(s.nodes.get('P')!.opr, null, 'no OPR from a non-opr relation');
});
