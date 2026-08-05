// When a thing was written down (1.23.0).
//
// `docs/nd-collisions.md` entry 17: working memory holds the context that made
// a captured fragment meaningful, and drops it within hours. The capture
// succeeds; the retrieval cue rots. By the time an item reaches triage, "call
// about the thing" is a stranger's note — so it gets routed blind, or trashed,
// or kept out of a vague guilt that it might have mattered.
//
// Capture itself is right to demand nothing at write time: the moment of
// capture cannot afford a question, and asking one is how a capture box stops
// being used. So the context has to be RECONSTRUCTED rather than requested, and
// the log already holds it — the genesis event's instant is the moment somebody
// wrote this down, and nobody has ever been shown it.
//
// ## What it may not become
//
// It states WHEN. It never states how long ago, in any form: "3 weeks old" and
// "you wrote this in June" are the same fact wearing an accusation, and this
// line appears on the surface where somebody is already working through a
// backlog they feel behind on. No elapsed count, no age, no "still". Law 5, and
// entry 15 — a machine's neutral reminder is read with the same raw nerve, so
// the fix is to give it nothing to read.
//
// A time of DAY rides along where it is close enough to be a real cue —
// "Tuesday evening" is a memory somebody can stand in; "Tuesday, 19:42" is a
// timestamp, and precision here reads as surveillance rather than help.
//
// PURE. `zone` is an argument.

import { localParts, calendarDaysBetween } from './time.ts';

/** Roughly when in the day, in the words somebody would use about their own
 *  morning. The boundaries are deliberately coarse — this is a memory aid, and
 *  an hour either way changes nothing about whether it helps. */
function partOfDay(hour: number): string {
  if (hour < 5) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

/**
 * "Written Tuesday evening" / "Written on 14 Jul" — or null when there is
 * nothing honest to say.
 *
 * WITHIN THE LAST WEEK the weekday is the cue that works: "Tuesday evening" is
 * a thing a person can place themselves inside. Beyond that a weekday name is
 * ambiguous and useless, so it becomes a date, and the year appears only when
 * the item is old enough that its absence would mislead.
 *
 * Today and yesterday are named as themselves. "Written Thursday morning" on a
 * Thursday afternoon is technically correct and reads as a puzzle.
 *
 * Null on an instant nothing can parse, which is a real case: an imported file
 * or a shard from another device can carry one, and this runs on the triage
 * surface where a throw would cost somebody the card they were working on.
 */
export function captureContextWords(atIso: string, zone: string, nowIso: string): string | null {
  let p;
  let days;
  try {
    p = localParts(atIso, zone);
    // Calendar days, not elapsed hours: at 00:30 an item written at 23:00 is
    // yesterday, and any measure in hours calls it "today" for another 23 of
    // them. The same reason `calendarDaysBetween` exists at all.
    days = calendarDaysBetween(nowIso, atIso, zone);
    // A parse that silently produced nonsense rather than throwing.
    if (!Number.isFinite(days) || !Number.isFinite(p.hour)) return null;
  } catch {
    return null;
  }

  const when = partOfDay(p.hour);

  // The future is not a state this can describe honestly. It happens: a device
  // with a wrong clock, or a shard from one. Saying nothing beats "Written
  // tomorrow morning".
  if (days > 0) return null;

  if (days === 0) return `Written this ${when === 'overnight' || when === 'night' ? 'night' : when}`;
  if (days === -1) return `Written yesterday ${when}`;

  if (days > -7) {
    const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long' })
      .format(new Date(atIso));
    return `Written ${weekday} ${when}`;
  }

  // Older than a week: a date, because a weekday name no longer locates
  // anything. No part of day either — nobody remembers the afternoon of a
  // Tuesday in June, so offering it implies a precision the cue does not have.
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, day: 'numeric', month: 'short',
    ...(days <= -365 ? { year: 'numeric' } : {}),
  }).format(new Date(atIso));
  return `Written on ${date}`;
}
