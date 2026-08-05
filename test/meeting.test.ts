// Stakeholders and the decision log (1.9.0, ADR-0057).
//
// The load-bearing properties: a stakeholder link written any time since
// 0.15.0 is ALREADY readable (nothing to heal, nothing to re-enter — the
// 1.2.3 lesson); removal is scoped so it cannot strip an OPR; a decision log
// is append-only and converges without an LWW slot; and no ChangeKind can be
// declared without being reachable — the invariant that stops the "Started"
// defect recurring.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor } from '../src/gate.ts';
import { stakeholdersOf, stakeholderWords, personView } from '../src/people.ts';
import { trackPortfolio, trackWords } from '../src/portfolio.ts';
import {
  CHANGE_KINDS, statusReport, renderReport, type ChangeKind,
} from '../src/delta.ts';
import { logDecisionEvents, removeStakeholderEvents } from '../src/ui/detail-intents.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW, device = 'd0'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device, seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `i${seq}`,
});
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);
const capture = (prior: State, id: string, text = id): State =>
  write(prior, [ev('capture.recorded', id, { text, source: 'quick', sourceTags: [] })]);

/** A tracked project with two people who care, linked the way the sheet does. */
function staffed(): State {
  let s = capture(emptyState(), 'P', 'the fielding review');
  s = write(s, [ev('node.kind.changed', 'P', { from: 'action', to: 'project' })]);
  s = write(s, [ev('project.role.set', 'P', { role: 'track' })]);
  s = write(s, [ev('person.created', 'SAM', { name: 'Sam' })]);
  s = write(s, [ev('person.created', 'ADA', { name: 'Ada' })]);
  s = write(s, [ev('person.linked', 'P', { node: 'P', person: 'SAM', relation: 'stakeholder' })]);
  s = write(s, [ev('person.linked', 'P', { node: 'P', person: 'ADA', relation: 'stakeholder' })]);
  return s;
}

// --- stakeholders ------------------------------------------------------------

test('THE HEALING: a link written with no stakeholder.added is already readable', () => {
  // The release's central claim. Every stakeholder linked since 0.15.0
  // appears the moment this ships — nothing re-entered, no fold rewrite.
  const s = staffed();
  const log = [...s.nodes.values()];
  void log;
  assert.deepEqual(stakeholdersOf(s, s.nodes.get('P')!).map(p => p.id), ['ADA', 'SAM'],
    'name order, and both of them');
});

test('stakeholder.added alone also lists them — a foreign shard’s shape', () => {
  let s = capture(emptyState(), 'P');
  s = write(s, [ev('person.created', 'SAM', { name: 'Sam' })]);
  s = write(s, [ev('stakeholder.added', 'P', { person: 'SAM' })]);
  assert.deepEqual(stakeholdersOf(s, s.nodes.get('P')!).map(p => p.id), ['SAM']);
});

test('both nouns for one person, or either twice, produce ONE entry', () => {
  let s = capture(emptyState(), 'P');
  s = write(s, [ev('person.created', 'SAM', { name: 'Sam' })]);
  s = write(s, [ev('person.linked', 'P', { node: 'P', person: 'SAM', relation: 'stakeholder' })]);
  s = write(s, [ev('stakeholder.added', 'P', { person: 'SAM' })]);
  s = write(s, [ev('stakeholder.added', 'P', { person: 'SAM' })]);
  assert.equal(stakeholdersOf(s, s.nodes.get('P')!).length, 1);
  assert.equal(s.nodes.get('P')!.people.filter(l => l.relation === 'stakeholder').length, 1);
});

test('taking somebody off removes them from the sheet AND the person lens', () => {
  // Two renders of one state disagreeing is the OPR defect's shape.
  let s = staffed();
  s = write(s, removeStakeholderEvents(ctx(), 'P', 'SAM'));
  assert.deepEqual(stakeholdersOf(s, s.nodes.get('P')!).map(p => p.id), ['ADA']);
  const view = personView(s, 'SAM', NOW, TZ)!;
  assert.equal(view.involves.some(l => l.node.id === 'P'), false,
    'the person lens agrees — one home, one answer');
});

test('removal is SCOPED: it cannot strip the same person’s other relations', () => {
  let s = staffed();
  s = write(s, [ev('person.linked', 'P', { node: 'P', person: 'SAM', relation: 'opr' })]);
  assert.equal(s.nodes.get('P')!.opr, 'SAM');
  s = write(s, removeStakeholderEvents(ctx(), 'P', 'SAM'));
  const n = s.nodes.get('P')!;
  assert.equal(n.opr, 'SAM', 'still running it');
  assert.ok(n.people.some(l => l.person === 'SAM' && l.relation === 'opr'));
  assert.equal(stakeholdersOf(s, n).some(p => p.id === 'SAM'), false, 'but off the list');
});

test('a removal naming nobody is a NO-OP, never a remove-all', () => {
  let s = staffed();
  s = fold([ev('stakeholder.removed', 'P', {})], s);
  assert.equal(stakeholdersOf(s, s.nodes.get('P')!).length, 2, 'refused, not guessed');
});

test('a removal for someone who was never on the list changes nothing', () => {
  let s = staffed();
  s = write(s, removeStakeholderEvents(ctx(), 'P', 'NOBODY'));
  assert.equal(stakeholdersOf(s, s.nodes.get('P')!).length, 2);
});

test('CONVERGENCE: add on one device, remove on another, either arrival order', () => {
  const base = staffed();
  const add = ev('stakeholder.added', 'P', { person: 'BEA' }, '2026-07-29T19:00:00.000Z', 'ipad');
  const bea = ev('person.created', 'BEA', { name: 'Bea' }, '2026-07-29T18:55:00.000Z', 'ipad');
  const off = ev('stakeholder.removed', 'P', { person: 'SAM' }, '2026-07-29T19:30:00.000Z', 'phone');
  const one = fold([bea, add, off], base);
  const two = fold([off, bea, add], base);
  assert.deepEqual(stakeholdersOf(one, one.nodes.get('P')!).map(p => p.id),
    stakeholdersOf(two, two.nodes.get('P')!).map(p => p.id));
  assert.deepEqual(stakeholdersOf(one, one.nodes.get('P')!).map(p => p.id), ['ADA', 'BEA']);
});

test('re-adding after a removal puts them back', () => {
  let s = staffed();
  s = write(s, removeStakeholderEvents(ctx(), 'P', 'SAM'));
  s = write(s, [ev('stakeholder.added', 'P', { person: 'SAM' })]);
  assert.equal(stakeholdersOf(s, s.nodes.get('P')!).some(p => p.id === 'SAM'), true);
});

test('a let-go person is not listed — personName’s lesson, applied not re-derived', () => {
  let s = staffed();
  s = write(s, [ev('node.trashed', 'SAM', { reason: 'test' })]);
  assert.deepEqual(stakeholdersOf(s, s.nodes.get('P')!).map(p => p.id), ['ADA']);
});

test('the order is TOTAL — two reads of one state cannot disagree', () => {
  const s = staffed();
  assert.deepEqual(stakeholdersOf(s, s.nodes.get('P')!).map(p => p.id),
    stakeholdersOf(s, s.nodes.get('P')!).map(p => p.id));
});

test('the portfolio names them, and still grades nothing', () => {
  const s = staffed();
  const line = trackPortfolio(s, NOW, TZ)[0]!;
  assert.deepEqual(line.stakeholders, ['Ada', 'Sam']);
  const words = trackWords(line);
  assert.match(words, /Ada and Sam care how it goes/);
  for (const bad of ['behind', 'late', 'slipping', 'at risk', 'stalled', 'overdue',
    'failing', 'poor', 'bad', 'urgent']) {
    assert.doesNotMatch(words, new RegExp(bad, 'i'), `"${words}" contains "${bad}"`);
  }
});

test('the clause names one, two, and overflows with a true count — never a score', () => {
  assert.equal(stakeholderWords([]), null);
  assert.equal(stakeholderWords(['Sam']), 'Sam cares how it goes');
  assert.equal(stakeholderWords(['Sam', 'Ada']), 'Sam and Ada care how it goes');
  assert.equal(stakeholderWords(['Sam', 'Ada', 'Bea']), 'Sam, Ada and 1 other care how it goes');
  assert.equal(stakeholderWords(['Sam', 'Ada', 'Bea', 'Cy']), 'Sam, Ada and 2 others care how it goes');
});

// --- the decision log --------------------------------------------------------

test('decisions append in order, and a re-delivered event does not duplicate', () => {
  let s = capture(emptyState(), 'P', 'the review');
  s = write(s, logDecisionEvents(ctx(), 'P', 'we ship on the 12th'));
  const second = logDecisionEvents({ ...ctx(), at: '2026-07-29T19:00:00.000Z' }, 'P', 'Ada writes the brief');
  s = write(s, second);
  assert.deepEqual(s.nodes.get('P')!.decisions.map(d => d.text),
    ['we ship on the 12th', 'Ada writes the brief']);
  // A shard union can deliver the same event twice.
  const again = fold(second, s);
  assert.equal(again.nodes.get('P')!.decisions.length, 2, 'idempotent by event id');
});

test('a decision is never edited and never removed — there is no verb for it', () => {
  let s = capture(emptyState(), 'P');
  s = write(s, logDecisionEvents(ctx(), 'P', 'the first call'));
  // The way back is to log the new one, which is what a decision log is for.
  s = write(s, logDecisionEvents({ ...ctx(), at: '2026-07-30T18:00:00.000Z' }, 'P',
    'on the 30th we reversed that'));
  assert.equal(s.nodes.get('P')!.decisions.length, 2, 'both stand — the record does not un-happen');
});

test('an empty or whitespace decision writes nothing', () => {
  for (const bad of ['', '   ', '\n\t ']) {
    assert.deepEqual(logDecisionEvents(ctx(), 'P', bad), [], JSON.stringify(bad));
  }
});

test('decision text keeps its newlines and loses its control characters', () => {
  const s = write(capture(emptyState(), 'P'),
    logDecisionEvents(ctx(), 'P', 'line one\nline two‮ reversed'));
  const d = s.nodes.get('P')!.decisions[0]!;
  assert.match(d.text, /line one\nline two/, 'prose keeps its shape');
  assert.doesNotMatch(d.text, /‮/, 'a bidi override cannot make it display as something else');
});

test('payload.at is used when valid; a malformed one falls back to the event', () => {
  let s = capture(emptyState(), 'P');
  s = fold([ev('decision.logged', 'P', { text: 'a', at: '2026-06-01T00:00:00.000Z' })], s);
  assert.equal(s.nodes.get('P')!.decisions[0]!.at, '2026-06-01T00:00:00.000Z');
  s = fold([ev('decision.logged', 'P', { text: 'b', at: 'not a date' })], s);
  assert.equal(s.nodes.get('P')!.decisions[1]!.at, NOW, 'refused, not guessed');
});

test('meeting is folded when present and null when absent — reserved, not written', () => {
  let s = capture(emptyState(), 'P');
  s = fold([ev('decision.logged', 'P', { text: 'a', at: NOW, meeting: 'the Tuesday call' })], s);
  assert.equal(s.nodes.get('P')!.decisions[0]!.meeting, 'the Tuesday call');
  const written = logDecisionEvents(ctx(), 'P', 'b')[0]!.payload as Record<string, unknown>;
  assert.equal('meeting' in written, false, 'nothing writes one in 1.9.0');
});

test('decisions survive a snapshot round-trip, and a pre-1.9.0 snapshot reads as none', () => {
  let s = capture(emptyState(), 'P');
  s = write(s, logDecisionEvents(ctx(), 'P', 'kept'));
  const back = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  assert.deepEqual(back.nodes.get('P')!.decisions.map(d => d.text), ['kept']);
  const legacy = JSON.parse(JSON.stringify(serialiseState(s))) as { nodes: Record<string, unknown>[] };
  for (const n of legacy.nodes) delete n['decisions'];
  const old = deserialiseState(legacy);
  assert.deepEqual(old.nodes.get('P')!.decisions, [], 'absent means none, never a throw');
});

// --- the report --------------------------------------------------------------

test('THE INVARIANT: every ChangeKind is reachable — no declared-and-dead section', () => {
  // The durable half of the "Started" fix. The Record over the union makes
  // tsc fail if a kind has no witness; the loop proves each witness really
  // produces that kind, so a section that can never render cannot ship.
  const person = (s: State): State => write(s, [ev('person.created', 'W', { name: 'W' })]);
  const WITNESS: Record<ChangeKind, () => [State, State]> = {
    finished: () => {
      const before = capture(emptyState(), 'X');
      return [before, write(before, [ev('done.marked', 'X', { at: NOW })])];
    },
    new: () => [emptyState(), capture(emptyState(), 'X')],
    'let-go': () => {
      const before = capture(emptyState(), 'X');
      return [before, write(before, [ev('node.trashed', 'X', { reason: 'test' })])];
    },
    'now-waiting': () => {
      const before = person(capture(emptyState(), 'X'));
      return [before, write(before, [
        ev('node.kind.changed', 'X', { from: 'action', to: 'waiting-for' }),
        ev('waiting.opened', 'X', { person: 'W', forWhat: 'the answer', since: NOW }),
      ])];
    },
    arrived: () => {
      const before = write(person(capture(emptyState(), 'X')), [
        ev('node.kind.changed', 'X', { from: 'action', to: 'waiting-for' }),
        ev('waiting.opened', 'X', { person: 'W', forWhat: 'the answer', since: NOW }),
      ]);
      return [before, write(before, [ev('waiting.closed', 'X', { outcome: 'got it' })])];
    },
  };
  for (const kind of CHANGE_KINDS) {
    const [before, after] = WITNESS[kind]();
    const r = statusReport(before, after, null, NOW, TZ);
    assert.ok(r.changes.some(c => c.kind === kind), `nothing can produce "${kind}"`);
  }
});

test('no report in any format carries a "Started" heading', () => {
  const before = capture(emptyState(), 'X');
  const after = write(before, [ev('done.marked', 'X', { at: NOW })]);
  const r = statusReport(before, after, null, NOW, TZ);
  for (const f of ['markdown', 'clipboard', 'csv'] as const) {
    assert.doesNotMatch(renderReport(r, f, TZ), /Started/i, f);
  }
});

test('decisions appear under "Decided" in every format, and only new ones', () => {
  let before = capture(emptyState(), 'P', 'the review');
  before = write(before, logDecisionEvents(ctx(), 'P', 'told them already'));
  const after = write(before, logDecisionEvents(
    { ...ctx(), at: '2026-07-29T19:00:00.000Z' }, 'P', 'we ship on the 12th'));
  const r = statusReport(before, after, NOW, NOW, TZ);
  assert.deepEqual(r.decided.map(d => d.text), ['we ship on the 12th'],
    'a delta, not a roster — what they have heard does not repeat');
  for (const f of ['markdown', 'clipboard', 'csv'] as const) {
    const out = renderReport(r, f, TZ);
    assert.match(out, /we ship on the 12th/, f);
    assert.doesNotMatch(out, /told them already/, `${f}: already reported`);
  }
  assert.match(renderReport(r, 'markdown', TZ), /### Decided/);
});

test('THE GUARD: a period of only decisions never says "Nothing to report."', () => {
  // The highest-probability defect in this release: a fourth section added
  // without teaching the empty-guard about it produces a document that lists
  // real decisions and also says nothing happened.
  const before = capture(emptyState(), 'P', 'the review');
  const after = write(before, logDecisionEvents(ctx(), 'P', 'we ship on the 12th'));
  const r = { ...statusReport(before, after, NOW, NOW, TZ), outstanding: [], ahead: [] };
  assert.equal(r.changes.length, 0, 'staged: nothing but the decision');
  for (const f of ['markdown', 'clipboard', 'csv'] as const) {
    assert.doesNotMatch(renderReport(r, f, TZ), /Nothing to report/, f);
  }
});

test('an empty period still says "Nothing to report." in every format', () => {
  const s = emptyState();
  const r = statusReport(s, s, NOW, NOW, TZ);
  for (const f of ['markdown', 'clipboard', 'csv'] as const) {
    assert.match(renderReport(r, f, TZ), /Nothing to report/, f);
  }
});

test('a decision on a thing that was let go is not reported', () => {
  const before = capture(emptyState(), 'P');
  let after = write(before, logDecisionEvents(ctx(), 'P', 'a decision'));
  after = write(after, [ev('node.trashed', 'P', { reason: 'test' })]);
  assert.deepEqual(statusReport(before, after, NOW, NOW, TZ).decided, []);
});

test('decision prose cannot inject a formula or break the CSV', () => {
  const before = capture(emptyState(), 'P');
  const after = write(before, logDecisionEvents(ctx(), 'P',
    '=SUM(A1),"quoted", and a\nnewline'));
  const csv = renderReport(statusReport(before, after, NOW, NOW, TZ), 'csv', TZ);
  assert.match(csv, /"'=SUM\(A1\)/, 'a leading = is neutralised');
  assert.match(csv, /""quoted""/, 'quotes are doubled');
  assert.equal(csv.split('\r\n').length, 2, 'and the newline stays inside its cell');
});

test('decision prose cannot open a heading or a bare line in Markdown', () => {
  const before = capture(emptyState(), 'P');
  const after = write(before, logDecisionEvents(ctx(), 'P', '# not a heading\nsecond line'));
  const md = renderReport(statusReport(before, after, NOW, NOW, TZ), 'markdown', TZ);
  const lines = md.split('\n').filter(l => l.includes('not a heading'));
  assert.equal(lines.length, 1, 'one line, collapsed');
  assert.match(lines[0]!, /^- /, 'and it is still a bullet');
  assert.doesNotMatch(md, /^# not a heading/m, 'it cannot become a heading');
});

test('the report stays byte-identical for the same pair, with decisions present', () => {
  const before = capture(emptyState(), 'P');
  const after = write(before, logDecisionEvents(ctx(), 'P', 'a decision'));
  const a = renderReport(statusReport(before, after, NOW, NOW, TZ), 'markdown', TZ);
  const b = renderReport(statusReport(before, after, NOW, NOW, TZ), 'markdown', TZ);
  assert.equal(a, b);
});
