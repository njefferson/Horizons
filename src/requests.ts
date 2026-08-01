// Request slots and the Not Now ledger (1.8.0, ADR-0056).
//
// Two ideas, one module, both from the thesis's stimulus-control section:
// declining someone's request is a DECISION WORTH KEEPING (the ledger — "the
// thing to point at when the same request comes back"), and a request slot is
// a scheduled place for requests to WAIT, so they are not evaluated at
// arrival. The scheduling does the work; nothing detects, counts, or nags.
//
// The line this module must never blur (ADR-0042, restated in ADR-0056): the
// ledger records declines of OTHERS' requests. A record of the times you did
// not do your own work is the ledger this app exists to NOT keep — the do-now
// offer's "Not now" writes nothing, ever.
//
// PURE. `now` and `zone` are arguments, like every projection here.

import type { NodeState, State } from './fold.ts';
import { survivorOf } from './merged.ts';
import { compareOrdering } from './fold.ts';
import { endOfLocalDay, localParts, utcMs } from './time.ts';

/** The closed recurrence vocabulary: one slot, weekday granularity. Full
 *  RRULE is deliberately absent — the single consumer is "the end of the next
 *  such local day", and the prefix format extends later without migration. */
export const SLOT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type SlotDay = typeof SLOT_DAYS[number];

const DAY_INDEX: Record<SlotDay, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};
const DAY_WORDS: Record<SlotDay, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

/** 'weekly:thu' -> 'thu'; anything unrecognised -> null. REFUSED, not guessed
 *  (the import-inspection rule): a malformed recurrence from an older or newer
 *  shard reads as no slot rather than as a Thursday somebody never chose. */
export function parseSlot(recurrence: string | null | undefined): SlotDay | null {
  if (!recurrence || !recurrence.startsWith('weekly:')) return null;
  const day = recurrence.slice('weekly:'.length);
  return (SLOT_DAYS as readonly string[]).includes(day) ? (day as SlotDay) : null;
}

/** The slot currently set, or null — null means the feature is invisible
 *  everywhere; setting a slot IS the opt-in (ADR-0056). */
export const slotOf = (state: State): SlotDay | null =>
  parseSlot(state.requestSlot?.recurrence);

/**
 * The end of the next slot day, as an instant — where a parked request waits
 * until. Today counts when today IS the slot day: the slot is where requests
 * wait, and tonight is the nearest one. DST-safe by construction: the walk is
 * over calendar days and `endOfLocalDay` owns the midnight edge cases.
 */
export function nextSlotOccurrence(day: SlotDay, nowIso: string, zone: string): string {
  const p = localParts(nowIso, zone);
  for (let plus = 0; plus < 7; plus += 1) {
    const shifted = new Date(utcMs(p.year, p.month, p.day + plus));
    if (shifted.getUTCDay() === DAY_INDEX[day]) return endOfLocalDay(nowIso, zone, plus);
  }
  // Unreachable — seven consecutive days contain every weekday — but a walk
  // that could in principle miss must still terminate somewhere honest.
  return endOfLocalDay(nowIso, zone, 7);
}

/** "Thursday" — for the Extras control and the sheet button. */
export const slotDayWords = (day: SlotDay): string => DAY_WORDS[day];

/**
 * One ledger row: the declined thing, and where it lives now if it has since
 * been folded into something else (1.9.2). `host` is null for the ordinary
 * case — the thing is still itself.
 */
export interface LedgerRow {
  node: NodeState;
  host: NodeState | null;
}

/**
 * The Not Now ledger: nodes with a standing decline, newest decline first. A
 * capped RECORD of decisions, never an archive — every entry is under a park
 * clock (the gate saw to it), so everything here comes back.
 *
 * A declined thing that has since been FOLDED into something else keeps its
 * row (1.9.2, ADR-0058). Until then the row simply vanished, because this
 * filtered `!n.mergedInto` — and the ledger's whole job is being the thing to
 * point at when the same request comes back. "You folded it into Y, which you
 * are carrying" is a better answer than silence, not a worse one. The row
 * still opens the DECLINED node's own sheet, where "Split back out" lives.
 */
export function notNowLedger(state: State): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (const n of state.nodes.values()) {
    if (n.notNow === null || n.trashed) continue;
    if (!n.mergedInto) { out.push({ node: n, host: null }); continue; }
    // Folded away: keep it only while the chain still ends somewhere alive.
    // A chain into the trash or into nothing is not a place it "lives now".
    const host = survivorOf(state, n);
    if (host) out.push({ node: n, host });
  }
  return out.sort((a, b) => {
    const sa = a.node.stamps['notNow'], sb = b.node.stamps['notNow'];
    if (sa && sb) {
      const c = compareOrdering(sb, sa);          // newest first
      if (c !== 0) return c;
    }
    return a.node.id < b.node.id ? -1 : 1;
  });
}

/**
 * One ledger row's fact line: a name and a date, NEVER a count and never a
 * verdict (law 5 — "declined 3 times" is a score about a person and about
 * you, and neither is this app's to keep).
 */
export function ledgerRowWords(
  row: LedgerRow, titleOf: (id: string) => string | null, zone: string,
): string {
  const entry = row.node.notNow;
  if (!entry) return '';
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, day: 'numeric', month: 'short',
  }).format(new Date(entry.at));
  const who = entry.person ? titleOf(entry.person) : null;
  const said = who ? `${who} asked · declined ${day}` : `declined ${day}`;
  // Where it lives now, when it has been folded into something else. Still a
  // name and a date and a place — never a count, never a verdict.
  const where = row.host ? ` · now part of ${row.host.title || '(untitled)'}` : '';
  return `${said}${where}`;
}
