// The delta report (v1 Must): what has changed since you last told anyone.
//
// `status.report.exported` has been in the vocabulary from the start with the
// note *"this is the provenance 'delta since last export' reads from"*, and
// nothing read it, because nothing wrote it.
//
// The arithmetic is the one this whole app is built on: **state = fold(log)**.
// So "what changed since Tuesday" is not a change-log to maintain and keep in
// sync — it is `fold(log up to Tuesday)` compared with `fold(log)`. There is no
// second source of truth to drift, and a delta over an imported history is
// exactly as correct as one over a history this device wrote.
//
// PURE, and it takes both states as arguments.

import type { NodeState, State } from './fold.ts';
import { decisionsFor } from './merged.ts';
import { heldNodes } from './gate.ts';
import { isOpenWaiting, withWhom, openDays } from './people.ts';
import { calendarDaysBetween, daysWords, isValidIso, localDayKey } from './time.ts';

/**
 * What a report may say changed.
 *
 * `'started'` was declared here, given a heading and a slot in the section
 * order, and emitted by NOTHING — every report carried a section that could
 * not render (found 1.9.0; the OPR defect's exact shape). It is REMOVED
 * rather than implemented, for two reasons that outrank convenience.
 *
 * **It would be a shame ledger.** Started-and-not-finished becomes computable
 * by subtraction across two consecutive reports — in a document you hand to
 * your manager. Nothing else in this app permits that arithmetic, on purpose.
 *
 * **And this app has no in-progress state, deliberately.** Work is held,
 * clocked, or done. Every candidate definition was dishonest or empty: the
 * `start` clock is the DEFER verb (ADR-0045), so reporting it as a start is
 * a lie in the opposite direction; a focus session that opens and closes
 * inside the period is invisible to a two-State diff; and `todayFor` is
 * structurally uncomputable by design (ADR-0051) — reading it in the one
 * artefact that leaves the device would defeat that design.
 *
 * `CHANGE_KINDS` below is exported so a totality test can enumerate them:
 * the durable half of this fix is the invariant that a declared-but-
 * unreachable kind cannot recur.
 */
export type ChangeKind = 'finished' | 'arrived' | 'now-waiting' | 'let-go' | 'new';

export interface Change {
  node: NodeState;
  kind: ChangeKind;
  /** Plain words for the report. Descriptive, never evaluative. */
  words: string;
}

export interface DeltaReport {
  /** The instant the comparison starts from, or null for "everything so far". */
  since: string | null;
  /** What moved. */
  changes: Change[];
  /** What is still with someone else, and for how long. */
  outstanding: { node: NodeState; whom: string | null; days: number | null }[];
  /** Dates coming up, soonest first. */
  ahead: { node: NodeState; day: string; days: number }[];
  /** What was decided in the period, newest first (1.9.0, ADR-0057). A
   *  DELTA, not a roster: decisions logged before the mark do not reappear,
   *  the same rule every other section here obeys. */
  decided: { node: NodeState; text: string; at: string }[];
}

const alive = (n: NodeState): boolean => !n.trashed && !n.mergedInto;

/**
 * What changed between two states.
 *
 * The order of the branches matters and is deliberate: **the end of a thing
 * outranks anything else that happened to it**. A thing that arrived and was
 * then completed inside one reporting period is reported as finished,
 * because that is the useful sentence — "we finished it" is what somebody
 * wants to hear, not the journey it took to get there.
 */
export function deltaBetween(
  before: State, after: State, since: string | null,
  nowIso: string, zone: string,
): DeltaReport {
  const changes: Change[] = [];

  // Kinds that are NOT WORK never enter the report (1.17.3, the seam audit).
  // The report is the one document that leaves the device for another person's
  // eyes: a journal entry itemised as "New — (untitled)" is a private thing
  // disclosed by count; a pebble is weight the reader has no business seeing
  // (ADR-0014); a person is a roster change, and ADR-0057 already ruled rosters
  // out of reports as a disclosure nobody asked for; an anchor is a period, not
  // news. The same four kinds every work surface excludes, for the same reasons.
  const NOT_REPORTABLE = new Set(['journal', 'pebble', 'person', 'anchor']);
  for (const n of after.nodes.values()) {
    if (NOT_REPORTABLE.has(n.kind)) continue;
    const was = before.nodes.get(n.id);

    if (n.trashed && (!was || !was.trashed)) {
      changes.push({ node: n, kind: 'let-go', words: 'let go' });
      continue;
    }
    if (!alive(n)) continue;

    if (n.lastDone && (!was || !was.lastDone)) {
      changes.push({ node: n, kind: 'finished', words: 'finished' });
      continue;
    }
    if (was && !isOpenWaiting(n) && isOpenWaiting(was)) {
      changes.push({ node: n, kind: 'arrived', words: 'arrived' });
      continue;
    }
    if (isOpenWaiting(n) && (!was || !isOpenWaiting(was))) {
      const whom = withWhom(after, n);
      changes.push({ node: n, kind: 'now-waiting', words: whom ? `now with ${whom}` : 'now with someone else' });
      continue;
    }
    if (!was) {
      changes.push({ node: n, kind: 'new', words: 'new' });
      continue;
    }
  }

  const outstanding = [...heldNodes(after)]
    .filter(isOpenWaiting)
    .map(n => ({ node: n, whom: withWhom(after, n), days: openDays(n, nowIso, zone) }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || (a.node.id < b.node.id ? -1 : 1));

  // What was decided in the period (1.9.0). A decision the reader has already
  // been told about must not reappear, so this is a set difference on event
  // ids — the same "delta, not roster" rule every section above obeys.
  //
  // `seen` is built across the WHOLE of `before`, including trashed and merged
  // nodes, not per node (1.9.2). A decision's identity is its event id; which
  // node it hangs off is routing, not identity. Per-node, folding S into T
  // mid-period re-reported every one of S's old decisions under T — reported
  // as decided in a period when nothing was decided, in the one artefact that
  // leaves the device. Correct independently of merges, and REQUIRED once the
  // reader below follows folds.
  const seen = new Set<string>();
  for (const b of before.nodes.values()) for (const d of b.decisions) seen.add(d.id);
  const decided: DeltaReport['decided'] = [];
  for (const n of heldNodes(after)) {
    // Through the fold: a decision logged on something since folded into `n`
    // is a decision about `n` now — it used to vanish from the report entirely.
    for (const d of decisionsFor(after, n)) {
      if (!seen.has(d.id)) decided.push({ node: n, text: d.text, at: d.at });
    }
  }
  // Newest first, tie-broken to a TOTAL order like everything else here.
  decided.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.node.id < b.node.id ? -1 : 1));

  // A TOTAL order everywhere. Two runs of one state must produce byte-identical
  // reports, or "what changed since last time" starts including reshuffles.
  changes.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.node.id < b.node.id ? -1 : 1));
  return { since, changes, outstanding, ahead: [], decided };
}

/**
 * The whole report, with the dates ahead filled in.
 *
 * Split from `deltaBetween` because "what changed" is a comparison of two states
 * while "what is coming" is a fact about one of them — different questions, and
 * a caller wanting only the comparison should not have to receive a scan of
 * every clock in the store.
 */
export function statusReport(
  before: State, after: State, since: string | null, nowIso: string, zone: string, aheadDays = 14,
): DeltaReport {
  const r = deltaBetween(before, after, since, nowIso, zone);

  const ahead: DeltaReport['ahead'] = [];
  for (const n of heldNodes(after)) {
    if (n.lastDone) continue;
    const c = n.clocks.due ?? n.clocks.suspense;
    if (!c || !isValidIso(c.at)) continue;
    const days = calendarDaysBetween(nowIso, c.at, zone);
    if (days < 0 || days > aheadDays) continue;
    ahead.push({ node: n, day: localDayKey(c.at, zone), days });
  }
  ahead.sort((a, b) => a.days - b.days || (a.node.id < b.node.id ? -1 : 1));
  return { ...r, ahead };
}

/**
 * The events this device had already REPORTED, given the mark a report left.
 *
 * "What has changed since I last told anyone" is not a question about the clock.
 * A shard union (ADR-0035) brings in another device's history stamped *before*
 * your last report — you have never seen it and have certainly never reported
 * it, yet a purely time-based cut puts it on the wrong side of the line and it
 * is silently absent from every report you ever send again (audit).
 *
 * So the mark a report leaves is a **per-device high-water mark**, the same
 * structure a shard uses to prove it is complete. Everything at or below it was
 * known when the report went out; everything else is news, whenever it happened.
 *
 * `at`-based filtering remains the fallback for a report written before this
 * existed — a mark with no watermark is still a mark, and an old log must keep
 * working (data is never lost to updates).
 */
export function reportedBefore<T extends { at: string; device: string; seq: number }>(
  events: readonly T[],
  mark: { at: string | null; upToSeqByDevice?: Record<string, number> | null },
): T[] {
  const hw = mark.upToSeqByDevice;
  if (hw && Object.keys(hw).length > 0) {
    return events.filter(e => Object.hasOwn(hw, e.device) && e.seq <= hw[e.device]!);
  }
  if (!mark.at) return [];
  return events.filter(e => e.at <= mark.at!);
}

// --- rendering --------------------------------------------------------------

export type ReportFormat = 'clipboard' | 'markdown' | 'print' | 'csv';

const HEADS: Record<ChangeKind, string> = {
  finished: 'Finished',
  arrived: 'Came back',
  'now-waiting': 'With other people now',
  new: 'New',
  'let-go': 'Let go',
};
/** The section order, exported so the totality test can enumerate every kind
 *  and prove each one is reachable (1.9.0). */
export const CHANGE_KINDS: ChangeKind[] = ['finished', 'arrived', 'now-waiting', 'new', 'let-go'];
const ORDER = CHANGE_KINDS;

const title = (n: NodeState): string => n.title || '(untitled)';

/**
 * A title, made safe to put in a Markdown document.
 *
 * Titles are free text somebody typed, stored VERBATIM by design — the share
 * target composes title/text/url with newlines, so multi-line titles are normal
 * rather than hostile. Dropped into a bullet list unchanged, one of them ended a
 * list, opened a heading, and emitted a bare line reading "Nothing to report."
 * into a report about real work (audit). That is not a rendering blemish: it is a
 * document you hand to another person, saying something untrue.
 *
 * So: newlines and runs of whitespace collapse to a single space, and the
 * characters that begin a Markdown block at the start of a line are escaped.
 * Exactly the same reasoning as the CSV formula guard below — which was written
 * first and then not applied here, which is the oversight this fixes.
 */
const mdSafe = (v: string): string =>
  v.replace(/\s+/g, ' ').trim()
   .replace(/^([#>\-*+|=]|\d+[.)])/, '\\$1')
   .replace(/\|/g, '\\|');

const mdTitle = (n: NodeState): string => mdSafe(title(n));

/** The one line that says what period this covers. Honest about "everything so
 *  far", which is what the first report of all genuinely is. */
export function periodWords(since: string | null, zone: string): string {
  return since && isValidIso(since)
    ? `Since ${localDayKey(since, zone)}`
    : 'Everything so far';
}

export function renderMarkdown(r: DeltaReport, zone: string): string {
  const out: string[] = [`## Status — ${periodWords(r.since, zone).toLowerCase()}`, ''];
  for (const kind of ORDER) {
    const rows = r.changes.filter(c => c.kind === kind);
    if (rows.length === 0) continue;
    out.push(`### ${HEADS[kind]}`);
    for (const c of rows) out.push(`- ${mdTitle(c.node)}`);
    out.push('');
  }
  // What was decided belongs with what moved, not with what is outstanding —
  // a decision is a thing that happened, not a demand still standing (1.9.0).
  if (r.decided.length) {
    out.push('### Decided');
    for (const d of r.decided) out.push(`- ${mdTitle(d.node)} — ${mdSafe(d.text)}`);
    out.push('');
  }
  if (r.outstanding.length) {
    out.push('### Still with someone else');
    for (const w of r.outstanding) {
      const bits = [mdTitle(w.node)];
      if (w.whom) bits.push(`— ${mdSafe(w.whom)}`);
      if (w.days != null && w.days >= 1) bits.push(`(${daysWords(w.days)})`);
      out.push(`- ${bits.join(' ')}`);
    }
    out.push('');
  }
  if (r.ahead.length) {
    out.push('### Coming up');
    for (const a of r.ahead) out.push(`- ${a.day} — ${mdTitle(a.node)}`);
    out.push('');
  }
  // NOTHING is a legitimate answer and it is said plainly. A report that padded
  // an empty period with a summary sentence would be inventing content for a
  // reader who is going to act on it.
  if (r.changes.length === 0 && r.outstanding.length === 0 && r.ahead.length === 0
    && r.decided.length === 0) {
    out.push('Nothing to report.', '');
  }
  return out.join('\n');
}

/** Plain text, for pasting into a message box that eats Markdown. */
export function renderText(r: DeltaReport, zone: string): string {
  return renderMarkdown(r, zone)
    .replace(/^#+ /gm, '')
    .replace(/^- /gm, '• ');
}

/**
 * CSV, RFC 4180.
 *
 * Quoted always and doubled internally, because a title is free text a person
 * typed and it WILL contain a comma, a quote, or a newline. A leading `=`, `+`,
 * `-` or `@` is prefixed with a `'` so a spreadsheet treats it as text: a title
 * beginning `=` is a formula in Excel, Numbers and Sheets alike, and this file
 * is meant to be opened in one of them.
 */
export function renderCsv(r: DeltaReport, zone: string): string {
  const cell = (v: string): string => {
    const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${guarded.replace(/"/g, '""')}"`;
  };
  const rows: string[][] = [['section', 'item', 'detail']];
  for (const kind of ORDER) {
    for (const c of r.changes.filter(x => x.kind === kind)) {
      rows.push([HEADS[kind], title(c.node), c.words]);
    }
  }
  for (const w of r.outstanding) {
    rows.push(['Still with someone else', title(w.node),
      [w.whom ?? '', w.days != null && w.days >= 1 ? daysWords(w.days) : ''].filter(Boolean).join(', ')]);
  }
  for (const d of r.decided) rows.push(['Decided', title(d.node), d.text]);
  for (const a of r.ahead) rows.push(['Coming up', title(a.node), a.day]);
  if (rows.length === 1) rows.push(['', 'Nothing to report.', periodWords(r.since, zone)]);
  return rows.map(cols => cols.map(cell).join(',')).join('\r\n');
}

export function renderReport(r: DeltaReport, format: ReportFormat, zone: string): string {
  if (format === 'csv') return renderCsv(r, zone);
  if (format === 'markdown') return renderMarkdown(r, zone);
  return renderText(r, zone);
}
