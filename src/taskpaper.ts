// Bringing work in from another planner (OmniFocus and anything TaskPaper-shaped).
//
// Noah: *"Possible to import an Omnifocus export and really test at scale?"*
//
// ## Why TaskPaper and not the archive
//
// OmniFocus exports several ways. `.ofocus-archive` is a bundle of zipped XML
// transaction files — the richest and by far the most brittle, and parsing somebody
// else's private sync format is a maintenance promise this project should not make.
// **TaskPaper is a line format**: indentation is hierarchy, `@tags` carry the
// metadata, and it is plain text a person can read and correct before importing.
// OmniFocus writes it natively (Export, or Copy as TaskPaper), and so do Things,
// Taskpaper.app, Bike, and a dozen others — so one parser serves everybody rather
// than one vendor.
//
// It is also the format that FAILS HONESTLY. A malformed XML bundle produces a
// stack trace; a malformed line produces one line somebody can look at.
//
// ## What maps, and what deliberately does not
//
// - a `Project:` line becomes a **project**, and its indented children are parented
//   to it — the containment a flat list cannot express, which is the main reason
//   importing at scale is worth doing at all;
// - `- an action` becomes an **action**;
// - `@due(2026-08-05)` becomes a **`due` clock** — a date somebody chose, so it is
//   one of the few kinds a calendar may carry (`CALENDAR_KINDS`);
// - `@defer(...)` / `@start(...)` becomes a **`start` clock**;
// - `@done` / `@done(date)` becomes **`done.marked`**;
// - `@flagged` is DROPPED, and that is a decision rather than an omission: a flag
//   is a priority mark, and this app has no priority field on purpose — pressure
//   comes from the decay primitive, never from a star somebody set in a better
//   mood. Recording it as a fake clock would invent a demand nobody made.
// - `@estimate`, `@context`, `@tags` other than the above are dropped for now, and
//   the importer SAYS SO rather than quietly discarding them.
// - **notes are carried** (1.4.0) — TaskPaper note lines attach to the item
//   above them (consecutive lines join as one note; a leading note with no item
//   to belong to is dropped and not counted), and the CSV Notes column lands in
//   full. Both ride `node.field.set{field:'note'}` right after the row's
//   creation. History: the first importer dropped every note silently (audit —
//   a 1,445-row import lost every body with the summary reporting zero); 1.2.3
//   stated the loss; this carries them.
//
// ## Dates
//
// TaskPaper dates are local wall-clock, usually `YYYY-MM-DD` and sometimes with a
// time. They are converted with `endOfDayKey` in the reader's zone, so a due date
// imported from another planner lands on the same DAY it displayed there — not
// shifted by however many hours separate that planner's idea of midnight from UTC.
//
// PURE. No store, no clock of its own, no DOM.

import type { AppEvent } from './events.ts';
import { cleanNote } from './note.ts';
import { endOfLocalDay, isValidIso, localDayKey, localParts, utcMs } from './time.ts';

export interface ImportContext {
  at: string;
  device: string;
  vault: string;
  zone: string;
  seq: () => number;
  id: () => string;
}

/** One line, understood. Exported because the tests assert the PARSE separately
 *  from the event mapping — two stages, two failure modes, told apart. */
export interface TaskLine {
  /** Indentation depth in levels, tabs or runs of spaces. */
  depth: number;
  kind: 'project' | 'action' | 'note';
  title: string;
  /** `YYYY-MM-DD`, already validated as a real calendar date. */
  due: string | null;
  start: string | null;
  done: boolean;
  /** Tags present that this app deliberately does not carry. */
  dropped: string[];
  /** A parent named EXPLICITLY rather than by indentation. OmniFocus CSV has a
   *  "Project" column instead of nesting, and rows can arrive before the project
   *  they belong to — so a name is resolved by lookup, and a project named by a
   *  child but never listed itself is created rather than dropped. */
  parentName?: string;
  /** CSV only: the row's Notes value, kept in full (1.4.0). TaskPaper notes
   *  arrive as their own `kind: 'note'` lines instead, text in `title`. */
  note?: string;
}

export interface ImportSummary {
  projects: number;
  actions: number;
  notes: number;
  done: number;
  withDates: number;
  /** Tag names seen but not carried, deduplicated and sorted. */
  droppedTags: string[];
  /** Lines that could not be understood at all, with their text kept so somebody
   *  can go and look rather than being told a number. */
  unreadable: string[];
  /** Dates that had already gone by at the moment of import, and therefore did NOT
   *  come across as dates. Counted so the summary can say so plainly. */
  staleDates: number;
  /** Rows whose repeat/rhythm was dropped-and-named. COUNTED (1.8.0): the bare
   *  tag list said "repeat" once for a file where sixty things repeat — the
   *  same unnumbered-loss shape as the pre-1.4.0 note bug. Rebuilding real
   *  rhythms as upkeep is a guided act only if the number is stated. */
  repeats: number;
}

const TAG = /@([A-Za-z][A-Za-z0-9_-]*)(?:\(([^)]*)\))?/g;

/** A real calendar date, not merely date-shaped: `2026-02-31` is refused. */
export function isCalendarDay(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // utcMs, not raw Date.UTC: with the two-digit-year trap the probe for a year
  // below 100 lands in the 1900s and a REAL day gets refused as unreal.
  const probe = new Date(utcMs(y, mo, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** The day part of a TaskPaper date value, or null. Accepts `2026-08-05`,
 *  `2026-08-05 17:00` and `2026-08-05T17:00`, because all three appear in the
 *  wild and the DAY is the only part this app keeps. */
const dayOf = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const first = value.trim().split(/[T\s]/)[0] ?? '';
  return isCalendarDay(first) ? first : null;
};

/** How deep a line sits. A tab is one level; so is every two spaces, which is what
 *  OmniFocus writes when the preference says spaces. Mixed files happen and both
 *  have to count, or a whole subtree silently flattens. */
export function depthOf(line: string): number {
  let depth = 0;
  let spaces = 0;
  for (const ch of line) {
    if (ch === '\t') { depth++; spaces = 0; continue; }
    if (ch === ' ') { spaces++; if (spaces === 2) { depth++; spaces = 0; } continue; }
    break;
  }
  return depth;
}

/**
 * Parse TaskPaper text into lines.
 *
 * Never throws. A file from another application is INPUT, and the whole point of
 * choosing a text format was that one bad line costs one line.
 */
export function parseTaskPaper(text: string): { lines: TaskLine[]; unreadable: string[] } {
  const lines: TaskLine[] = [];
  const unreadable: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const depth = depthOf(raw);
    const body = raw.replace(/^[\t ]+/, '');

    const dropped: string[] = [];
    let due: string | null = null;
    let start: string | null = null;
    let done = false;
    for (const m of body.matchAll(TAG)) {
      const name = (m[1] ?? '').toLowerCase();
      const value = m[2];
      if (name === 'due') { due = dayOf(value); if (due === null && value !== undefined) dropped.push('due'); continue; }
      if (name === 'defer' || name === 'start') {
        start = dayOf(value);
        if (start === null && value !== undefined) dropped.push(name);
        continue;
      }
      if (name === 'done' || name === 'completed') { done = true; continue; }
      // Named rather than silently swallowed. A person who tagged everything
      // `@flagged` deserves to be told that the flags did not come with them.
      dropped.push(name);
    }

    const title = body
      .replace(TAG, '')
      .replace(/^\s*-\s*/, '')
      .replace(/:\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (title === '') {
      // A line that is nothing but tags. Kept as unreadable rather than creating
      // an untitled node, because a planner full of "(untitled)" is worse than a
      // planner that told you about six lines it could not use.
      unreadable.push(raw.trim());
      continue;
    }

    // A project line ends with a colon BEFORE the tags are stripped. Checking
    // after stripping would make "Ship it: @due(...)" look like an action.
    const isProject = /:\s*(@[^\s]+\s*)*$/.test(body.trimEnd()) && !/^\s*-\s/.test(body);
    const isAction = /^\s*-\s/.test(body);
    lines.push({
      depth,
      kind: isProject ? 'project' : isAction ? 'action' : 'note',
      title, due, start, done, dropped,
    });
  }
  return { lines, unreadable };
}

/**
 * Lines to events.
 *
 * Every node lands legally: it either carries a date somebody set, or it is
 * parented to something that does, or — failing both — it gets nothing here and
 * the gate cures it at creation exactly as a typed capture is cured. That last
 * case is why this does not need to invent clocks: the write boundary already has
 * a correct answer for "no clock yet", and inventing a different one here would
 * put two rules in the app for the same question.
 */
/**
 * Has this day already gone, in the reader's own zone?
 *
 * One definition, used by both the mapper and the summary, because they must agree
 * about every single row — a count that disagreed with what was written would be a
 * summary describing a different import.
 */
export const isPastDay = (day: string, nowIso: string, zone: string): boolean =>
  day < localDayKey(nowIso, zone);

export function taskPaperEvents(
  ctx: ImportContext,
  parsed: readonly TaskLine[],
): AppEvent[] {
  const out: AppEvent[] = [];
  const stamp = (kind: string, node: string | null, payload: unknown): void => {
    out.push({
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind, node, payload,
    } as unknown as AppEvent);
  };

  /** Depth -> the id of the most recent CONTAINER at that depth. A note or an
   *  action never becomes a parent, so a child of an action attaches to that
   *  action's own parent instead of dangling. */
  const containerAt = new Map<number, string>();
  /** Project title -> id, for the CSV shape where a parent is NAMED rather than
   *  nested, and can be named by a child before it is listed itself. */
  const projectByTitle = new Map<string, string>();

  /** A project named by a child but never listed. Created rather than dropped:
   *  the alternative is silently reparenting somebody's task to nothing, which is
   *  how an import loses structure without losing rows and nobody notices. */
  const ensureProject = (title: string): string => {
    const found = projectByTitle.get(title);
    if (found !== undefined) return found;
    const id = ctx.id();
    stamp('node.created', id, { nodeKind: 'project', title, provenance: { for: 'self' } });
    projectByTitle.set(title, id);
    return id;
  };

  /** The most recent item CREATED (or re-met), so a TaskPaper note line —
   *  which belongs to the item above it by position, the only association the
   *  format has — knows what it is a note ON. Consecutive note lines are ONE
   *  note joined with newlines, emitted as a single `node.field.set`: two
   *  events would be per-field LWW overwriting itself, keeping only the last
   *  line. A note line before any item has nothing to belong to and is
   *  dropped; the summary counts only what actually attaches. */
  let lastItemId: string | null = null;
  let noteBuf: string[] = [];
  const flushNote = (): void => {
    if (lastItemId !== null && noteBuf.length > 0) {
      const value = cleanNote(noteBuf.join('\n'));
      if (value !== '') stamp('node.field.set', lastItemId, { field: 'note', value });
    }
    noteBuf = [];
  };

  for (const line of parsed) {
    if (line.kind === 'note') {
      if (lastItemId !== null) noteBuf.push(line.title);
      continue;
    }
    flushNote();

    // Named parent wins over indentation: a CSV row states its project outright,
    // and guessing from a synthesised depth would be inventing a fact.
    let parent: string | undefined;
    if (line.parentName !== undefined && line.parentName !== '') {
      parent = ensureProject(line.parentName);
    } else {
      for (let d = line.depth - 1; d >= 0; d--) {
        const candidate = containerAt.get(d);
        if (candidate !== undefined) { parent = candidate; break; }
      }
    }
    const id = line.kind === 'project' && projectByTitle.has(line.title)
      // Already created as somebody's named parent — do not make a second one.
      ? projectByTitle.get(line.title)!
      : ctx.id();
    const alreadyThere = line.kind === 'project' && projectByTitle.has(line.title);

    if (!alreadyThere) {
      stamp('node.created', id, {
        nodeKind: line.kind === 'project' ? 'project' : 'action',
        title: line.title,
        provenance: { for: 'self' },
        ...(parent === undefined ? {} : { parent }),
      });
    }
    lastItemId = id;

    // A CSV row carries its note ON the line; TaskPaper notes arrive as the
    // following note-lines and land through flushNote instead.
    if (line.note !== undefined) {
      const value = cleanNote(line.note);
      if (value !== '') stamp('node.field.set', id, { field: 'note', value });
    }

    if (line.kind === 'project') {
      projectByTitle.set(line.title, id);
      containerAt.set(line.depth, id);
      // Anything deeper than this belongs to it, not to a sibling it replaced.
      for (const d of [...containerAt.keys()]) if (d > line.depth) containerAt.delete(d);
    }

    // A date from another planner is a date somebody CHOSE, which is why it lands
    // as `due` and is therefore one a calendar may carry.
    //
    // **Unless it has already gone.** Noah's OmniFocus export carried 1,173 due
    // dates and EVERY ONE of them was in the past — the earliest from June 2019.
    // Imported as due dates they became 1,173 things needing a new plan on the
    // morning of the import: seven years of residue arriving as today's demands.
    //
    // A date that passed years ago in another planner is not a commitment somebody
    // is carrying, it is a record of one they did not keep, and manufacturing a
    // fresh obligation from it is the same mistake as putting the app's own clocks
    // in a calendar. So the day is DROPPED and the row arrives without one; the
    // gate cures it like any dateless thing, and the summary says how many and why.
    // The alternative — importing them and hiding the wall behind a cap — would
    // leave the app quietly asserting a thousand demands nobody made today.
    if (line.due !== null && !isPastDay(line.due, ctx.at, ctx.zone)) {
      stamp('clock.set', id, { clockKind: 'due', at: dayToInstant(line.due, ctx.zone), source: 'import:taskpaper' });
    }
    if (line.start !== null && !isPastDay(line.start, ctx.at, ctx.zone)) {
      stamp('clock.set', id, { clockKind: 'start', at: dayToInstant(line.start, ctx.zone), source: 'import:taskpaper' });
    }
    if (line.done) stamp('done.marked', id, { at: ctx.at });
  }
  flushNote();
  return out;
}

/**
 * A calendar day to the end-of-local-day instant this app stores.
 *
 * Via `endOfLocalDay` on a midday anchor rather than by string surgery, so the
 * result is the same instant the app would have produced had somebody typed the
 * date in — one definition of "the end of that day", not two.
 */
function dayToInstant(day: string, zone: string): string {
  const anchor = `${day}T12:00:00.000Z`;
  if (!isValidIso(anchor)) return anchor;
  // Midday UTC can be the previous or next local day at the extremes, so the
  // offset is measured and corrected rather than assumed.
  const p = localParts(anchor, zone);
  const drift = utcMs(p.year, p.month, p.day) - utcMs(
    Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10)));
  const corrected = new Date(Date.parse(anchor) - drift).toISOString();
  return endOfLocalDay(corrected, zone, 0);
}

// --- CSV, because OmniFocus exports that too ---------------------------------
//
// One tolerant reader rather than a second importer: the columns are found BY
// HEADER NAME, case- and space-insensitively, so a version that renames "Due Date"
// to "Due" or reorders the file still works. A positional reader would break on the
// next OmniFocus update, silently, by reading dates out of the notes column.

/** RFC 4180 enough: quoted fields, doubled quotes inside them, newlines inside
 *  quotes. Written out because a naive `split(',')` mangles every note containing
 *  a comma, which is most of them. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; continue; }
        quoted = false;
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const norm = (h: string): string => h.toLowerCase().replace(/[^a-z]/g, '');

/** Header name to index, by normalised name, first match wins. */
function columns(header: readonly string[]): Map<string, number> {
  const at = new Map<string, number>();
  header.forEach((h, i) => { const k = norm(h); if (!at.has(k)) at.set(k, i); });
  return at;
}

const pick = (row: readonly string[], at: Map<string, number>, ...names: string[]): string => {
  for (const n of names) {
    const i = at.get(norm(n));
    if (i !== undefined && (row[i] ?? '').trim() !== '') return (row[i] ?? '').trim();
  }
  return '';
};

/** OmniFocus-shaped CSV to the same lines TaskPaper produces. */
export function parseOmniFocusCsv(text: string): { lines: TaskLine[]; unreadable: string[] } {
  const rows = parseCsv(text);
  const unreadable: string[] = [];
  if (rows.length < 2) return { lines: [], unreadable: rows.map(r => r.join(',')) };
  const at = columns(rows[0]!);
  const lines: TaskLine[] = [];

  for (const row of rows.slice(1)) {
    const title = pick(row, at, 'Name', 'Title', 'Task');
    if (title === '') { unreadable.push(row.join(',')); continue; }
    const type = pick(row, at, 'Type').toLowerCase();
    const status = pick(row, at, 'Status').toLowerCase();
    const projectName = pick(row, at, 'Project', 'Parent');
    const due = dayOf(pick(row, at, 'Due Date', 'Due'));
    const start = dayOf(pick(row, at, 'Defer Date', 'Start Date', 'Defer', 'Start'));
    const completion = pick(row, at, 'Completion Date', 'Completed');
    const dropped: string[] = [];
    if (pick(row, at, 'Flagged').toLowerCase() === 'true') dropped.push('flagged');
    for (const extra of ['Context', 'Tags', 'Estimated Minutes', 'Duration', 'Repeat']) {
      if (pick(row, at, extra) !== '') dropped.push(norm(extra));
    }

    const isProject = type === 'project' || (type === '' && projectName === '' && due === null);
    lines.push({
      depth: isProject ? 0 : 1,
      kind: isProject ? 'project' : 'action',
      title, due, start,
      done: completion !== '' || status === 'completed' || status === 'done',
      dropped,
      // Only for non-projects, and only when named — a project claiming itself as
      // its own parent would be a cycle the write boundary would rightly refuse.
      ...(isProject || projectName === '' || projectName === title ? {} : { parentName: projectName }),
      // Carried in full (1.4.0) — an earlier version read this cell and threw
      // it away, losing every note in a 1,445-row export with the summary
      // implying nothing was there (audit).
      ...(pick(row, at, 'Notes', 'Note') !== '' ? { note: pick(row, at, 'Notes', 'Note') } : {}),
    });
  }
  return { lines, unreadable };
}

/**
 * Read whichever of the two it is.
 *
 * Sniffed from the CONTENT, not from the filename: a file renamed on the way out of
 * one app and into another is the normal case, and refusing a good file because its
 * extension is wrong is the sort of pedantry that makes people give up.
 */
export function parseAnyExport(text: string): { lines: TaskLine[]; unreadable: string[]; format: 'taskpaper' | 'csv' } {
  const first = text.split(/\r?\n/).find(l => l.trim() !== '') ?? '';
  const looksCsv = first.includes(',')
    && ['name', 'title', 'task'].some(n => columns(parseCsv(first)[0] ?? []).has(n));
  return looksCsv
    ? { ...parseOmniFocusCsv(text), format: 'csv' }
    : { ...parseTaskPaper(text), format: 'taskpaper' };
}

/** What arrived, counted from the parse rather than from the events — the two are
 *  different questions and reporting one as the other is how a summary starts
 *  lying about a file. */
export function importSummary(
  parsed: readonly TaskLine[],
  unreadable: readonly string[],
  nowIso?: string,
  zone?: string,
): ImportSummary {
  const tags = new Set<string>();
  for (const l of parsed) for (const t of l.dropped) tags.add(t);
  const repeats = parsed.filter(l => l.dropped.some(t => t === 'repeat' || t === 'repeatrule')).length;
  const gone = (d: string | null): boolean =>
    d !== null && nowIso !== undefined && zone !== undefined && isPastDay(d, nowIso, zone);
  const live = (l: TaskLine): boolean =>
    (l.due !== null && !gone(l.due)) || (l.start !== null && !gone(l.start));
  return {
    projects: parsed.filter(l => l.kind === 'project').length,
    actions: parsed.filter(l => l.kind === 'action').length,
    // Notes that actually ATTACH (1.4.0): note-bearing CSV rows, plus TaskPaper
    // note lines that follow an item — a note line before any item has nothing
    // to belong to and is dropped, so counting it as carried would be the old
    // lie with the sign flipped. Mirrors the mapper's own attachment rule.
    notes: parsed.filter((l, i) =>
      l.note !== undefined ||
      (l.kind === 'note' && parsed.slice(0, i).some(p => p.kind !== 'note'))).length,
    done: parsed.filter(l => l.done).length,
    // Only dates that actually came across, so this number and the store agree.
    withDates: parsed.filter(live).length,
    droppedTags: [...tags].sort(),
    unreadable: [...unreadable],
    staleDates: parsed.filter(l => gone(l.due) || gone(l.start)).length,
    repeats,
  };
}

/**
 * What to say about it, before anything is written.
 *
 * States what came, what did NOT come, and what could not be read — all three,
 * because an importer that reports only its successes is how somebody discovers a
 * year later that half a planner never arrived.
 */
export function importWords(s: ImportSummary): string {
  const bits: string[] = [];
  if (s.projects > 0) bits.push(s.projects === 1 ? '1 project' : `${s.projects} projects`);
  if (s.actions > 0) bits.push(s.actions === 1 ? '1 action' : `${s.actions} actions`);
  if (bits.length === 0) return 'Nothing in that file could be read as work. Nothing has been changed.';

  const parts = [`Found ${bits.join(' and ')}`];
  if (s.withDates > 0) parts.push(`${s.withDates} with a date`);
  if (s.done > 0) parts.push(`${s.done} already finished`);
  let out = `${parts.join(', ')}.`;
  if (s.notes > 0) {
    // Inverted at 1.4.0: notes come across now. The 1.2.3 version of this
    // sentence stated the loss; before that, a silent zero cost a 1,445-row
    // import every note it had (audit). The count is of notes that ATTACH.
    out += ` ${s.notes === 1 ? 'One note comes' : `${s.notes} notes come`} across with ${s.notes === 1 ? 'its item' : 'their items'}, readable on each item's own sheet.`;
  }
  if (s.staleDates > 0) {
    // Said in full, because it is the single most surprising thing about importing
    // a long-running planner and somebody will otherwise think the dates were lost.
    out += ` ${s.staleDates === 1 ? 'One date had' : `${s.staleDates} dates had`} already gone by, so ${s.staleDates === 1 ? 'it comes' : 'they come'} in without a date rather than as something asking today.`;
  }
  if (s.repeats > 0) {
    // The number, not just the tag name (1.8.0): rhythms are not carried, and
    // the honest next step — rebuilding the real ones as upkeep — needs to
    // know whether that is three things or sixty.
    out += ` ${s.repeats === 1 ? 'One of them repeats' : `${s.repeats} of them repeat`} on a rhythm — rhythms are not carried; rebuild the real ones as upkeep when they matter.`;
  }
  if (s.droppedTags.length > 0) {
    out += ` These will not come with them: ${s.droppedTags.join(', ')}.`;
  }
  if (s.unreadable.length > 0) {
    out += ` ${s.unreadable.length === 1 ? 'One line' : `${s.unreadable.length} lines`} could not be read.`;
  }
  return out;
}
