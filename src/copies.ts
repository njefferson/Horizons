// When a copy of your data last left this device, and whether anything has
// happened since (1.14.0, ADR-0062).
//
// ## Why this exists
//
// `export.written` has been emitted since Phase 0 and READ BY NOTHING. Three
// call sites wrote it, the log viewer rendered it as one line among thousands,
// and no surface anywhere could answer "when did I last save a copy". Meanwhile
// ADR-0004 makes the exported file the whole durability story on iPadOS, and
// says in its own consequences: *"the export cadence has to be good enough to
// be the only mechanism… and if it is forgotten, the app should say so plainly
// rather than let the user assume they are covered."*
//
// This module is the reader that was missing. It is pure and it reads the LOG,
// never folded state — the `journalSeal` precedent from 1.13.0, and for the same
// reason: whether a copy exists is a fact about the record, not about any node,
// and `fold` should not grow a field for it.
//
// ## NOT every `export.written` is a copy of your data
//
// This is the whole subtlety, and getting it wrong would be a worse lie than
// saying nothing. Three different acts write this one noun:
//
//   - `deliverCopy` — `exportAll`, the whole log, importable. A COPY.
//   - `deliverRangeCopy` — a reading copy of a few things, deliberately NOT
//     importable (`inspectExport` refuses the format outright, ADR-0049).
//   - the calendar `.ics` — appointments, not data.
//
// Counting a calendar file as your backup would tell somebody they were covered
// on the day they were not. So a copy is recognised by its scope, and the set of
// whole-copy scopes lives HERE, beside the reader — with `deliverCopy` refusing
// any scope outside it. A hand-written list that the writer does not have to
// honour is a bug with a delay fuse (the 1.9.2 lesson); this one cannot fall
// behind, because adding a scope without adding it here fails at the call site.
//
// ## The deliver-then-record ordering, and the off-by-one it would cause
//
// The file is built and handed over BEFORE `export.written` is committed, so a
// failed export can never leave the log claiming a copy exists. The consequence
// is that **a file never contains its own `export.written`** — the record lands
// one export later. So "is there anything the copy does not hold" is *strictly
// after* that event, not *at or after* it. Reading it the other way would put
// the sentence on permanently, one millisecond after every export, which is the
// kind of always-on warning people learn to stop seeing.
//
// PURE. No storage, no clock, no DOM.

import type { AppEvent } from './events.ts';
import { compareEvents } from './fold.ts';

/**
 * The scopes that mean "the whole log, and it can be imported back".
 *
 * `deliverCopy` asserts against this set, so it is not a description of what the
 * writers happen to do — it is the rule they are held to.
 *
 * - `all` — the export button, and the copy taken before an update.
 * - `before-letting-go` — the automatic copy taken before a destructive bulk
 *   act (ADR-0049). A whole export by any other name, and it counts: somebody
 *   who let a range go this morning does have a copy from this morning.
 */
export const WHOLE_COPY_SCOPES: ReadonlySet<string> = new Set(['all', 'before-letting-go']);

/** The scope of an `export.written`, or null when the payload is not one. */
const scopeOf = (e: AppEvent): string | null => {
  const p = e.payload as { scope?: unknown } | null;
  return p && typeof p.scope === 'string' ? p.scope : null;
};

const isWholeCopy = (e: AppEvent): boolean =>
  e.kind === 'export.written' && WHOLE_COPY_SCOPES.has(scopeOf(e) ?? '');

/**
 * The newest whole copy in the log, or null when none has ever been written.
 *
 * Ordered by `compareEvents` — the same total order the fold uses — rather than
 * by array position, because a log is not guaranteed to arrive sorted and a
 * shard from another device can bring an older copy in after a newer one.
 *
 * A copy made on another device counts. It really was written, and it really
 * holds what that device had; whether it holds what THIS device has is exactly
 * the question `changesSinceCopy` answers.
 */
export function lastCopy(log: readonly AppEvent[]): AppEvent | null {
  let best: AppEvent | null = null;
  for (const e of log) {
    if (!isWholeCopy(e)) continue;
    if (!best || compareEvents(e, best) > 0) best = e;
  }
  return best;
}

/**
 * Is there anything in the log that the newest copy does not hold?
 *
 * This is ADR-0004's own definition of "stale", which it wrote with a warning
 * attached: *"it must not fire on a device that is simply used less often."*
 * Measuring the LOG rather than the clock is what satisfies that. A device
 * nobody has touched for three weeks has nothing newer than its copy, so it
 * says nothing — where a rule built on elapsed time would nag precisely the
 * person who had done nothing to nag about.
 *
 * `export.written` itself never counts as a change, whatever its scope. A
 * record that a copy was written is bookkeeping about copies; treating it as
 * unsaved work would mean exporting a calendar file made your data look stale.
 *
 * With no copy at all, everything is unheld — true, and the surface says the
 * simpler thing ("none yet") rather than this.
 */
export function changesSinceCopy(log: readonly AppEvent[], copy: AppEvent | null): boolean {
  if (!copy) return log.some(e => e.kind !== 'export.written');
  return log.some(e => e.kind !== 'export.written' && compareEvents(e, copy) > 0);
}

/**
 * The row's value: the day the last copy was written, or that there is not one.
 *
 * A day, never a duration and never a count. "11 days ago" is a number about how
 * far behind you are, and this app does not keep those (law 5) — a date is a
 * fact you can check against your own memory and act on or not.
 */
export function copyDayWords(copy: AppEvent | null, tz: string): string {
  if (!copy) return 'none yet';
  return new Date(copy.at).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: tz,
  });
}

/**
 * The sentence under the rows, or '' when there is nothing to say.
 *
 * **Silence is the covered state**, deliberately. The date is already on the
 * row; adding "you are up to date" would be congratulating somebody for
 * housekeeping, which is the shape this app refuses everywhere else.
 */
export function copyNote(log: readonly AppEvent[], copy: AppEvent | null): string {
  if (!copy) {
    return changesSinceCopy(log, null)
      ? 'No copy has left this device yet.'
      : '';
  }
  return changesSinceCopy(log, copy)
    ? 'There are changes here that no copy holds.'
    : '';
}
