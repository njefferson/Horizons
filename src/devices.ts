// Which devices have written into this planner.
//
// Noah: *"Can a user see how many devices are syncing, and delete them or reset
// the key to remove the sync from that point on."*
//
// The app has always known this — every event carries the id of the device that
// wrote it — and has never shown it. That is a real gap: somebody who cannot see
// how many devices are in their pair cannot notice an extra one.
//
// ## What "delete a device" can and cannot mean, stated honestly
//
// **It cannot mean removing its work.** Those events are the person's own
// writing, recorded on a device they own, and the log is append-only — law 9.
// Deleting a device's history would be deleting a fortnight of somebody's
// planner because they used their phone that fortnight. Nothing here offers it.
//
// **It can mean cutting off what happens next**, and that is what replacing the
// key does: a new key means a new mailbox, and any device still holding the old
// one is talking to a place nothing arrives at any more. That is a genuine
// revocation of FUTURE access, and it is the only one honestly available.
//
// **It cannot un-give what has already gone.** A device that holds a copy holds
// it. No control in any app can reach into another machine and take a thing back,
// and a control that implied otherwise would be lying at the exact moment
// somebody most needed the truth.
//
// PURE. Given the log and this device's id; no store, no clock.

import type { AppEvent } from './events.ts';

export interface DeviceRecord {
  device: string;
  /** True for the device the reader is holding. */
  isThisOne: boolean;
  /** How many events it wrote. A rough sense of how much came from where. */
  events: number;
  /** ISO instants, from the events themselves. */
  firstWrote: string;
  lastWrote: string;
}

/**
 * Every device that has written into this log, busiest-recent first.
 *
 * Counted from the EVENTS rather than from any list of devices, because a list
 * could drift from the log and this is meant to answer "who has actually
 * written here" — including a device somebody has forgotten about, which is the
 * whole reason for showing it.
 */
export function deviceRecords(
  events: readonly AppEvent[],
  ownDevice: string,
): DeviceRecord[] {
  const byDevice = new Map<string, { events: number; first: string; last: string }>();
  for (const e of events) {
    const seen = byDevice.get(e.device);
    if (!seen) {
      byDevice.set(e.device, { events: 1, first: e.at, last: e.at });
      continue;
    }
    seen.events++;
    if (e.at < seen.first) seen.first = e.at;
    if (e.at > seen.last) seen.last = e.at;
  }

  return [...byDevice.entries()]
    .map(([device, d]) => ({
      device,
      isThisOne: device === ownDevice,
      events: d.events,
      firstWrote: d.first,
      lastWrote: d.last,
    }))
    // This device first — somebody is looking for "which of these is me" before
    // anything else — then most recently active.
    .sort((a, b) => (a.isThisOne !== b.isThisOne)
      ? (a.isThisOne ? -1 : 1)
      : (a.lastWrote < b.lastWrote ? 1 : a.lastWrote > b.lastWrote ? -1 : 0));
}

/** A device id is a long opaque string. Shown short, because the whole of it is
 *  noise and the first characters are enough to tell two apart. */
export const shortDevice = (device: string): string => device.slice(0, 8);

/**
 * The headline. Counts DEVICES, not pairings, and says plainly when there is
 * only this one — "1 device" reads as a fault to somebody expecting two.
 */
export function devicesWords(records: readonly DeviceRecord[]): string {
  const others = records.filter(r => !r.isThisOne).length;
  if (records.length === 0) return 'Nothing has been written here yet.';
  if (others === 0) return 'Only this device has written anything here.';
  return others === 1
    ? 'Work here has come from this device and one other.'
    : `Work here has come from this device and ${others} others.`;
}

/** One line per device, for a list. Never a table (Doctrine §2). */
export function deviceLine(r: DeviceRecord, nowIso: string): string {
  const who = r.isThisOne ? 'This device' : `Another device (${shortDevice(r.device)})`;
  const count = r.events === 1 ? '1 entry' : `${r.events} entries`;
  return `${who} — ${count}, last wrote ${ago(r.lastWrote, nowIso)}`;
}

/** Plain relative time. No precision anybody has to decode. */
function ago(then: string, nowIso: string): string {
  const ms = Date.parse(nowIso) - Date.parse(then);
  if (!Number.isFinite(ms)) return 'at an unknown time';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 31) return days === 1 ? 'yesterday' : `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'about a month ago' : `about ${months} months ago`;
}

/**
 * What replacing the key does, and what it cannot do.
 *
 * Every clause is load-bearing, and TWO are the ones people — and an earlier
 * version of this very copy — get wrong. Revoking future access is not recalling
 * what has already been copied; and "from now on" is not instant, because the
 * handover point still holds the last few weeks of already-sent work, which the
 * old device can still collect until it expires. An audit caught the copy
 * implying the cut-off was total and immediate. It is neither, and saying so is
 * the difference between an honest control and a false sense of safety.
 */
export const REPLACE_KEY_WORDS =
  'Replacing the key gives this device a brand-new key and a fresh place to hand work over. '
  + 'From now on, a device still holding the old key receives nothing NEW from this one — so this is how you drop a device you no longer want in the pair. '
  + 'Two honest limits. Anything this device already handed over in the last few weeks stays at the old handover point until it expires on its own, so a dropped device that had not yet collected it still can, for up to a month. '
  + 'And it cannot reach into that device: whatever it already holds, it keeps, and nothing here can take that back. '
  + 'Your own writing is untouched, and you can pair a device again whenever you like.';

/** After it has happened. States the consequence somebody must now act on. */
export const REPLACED_KEY_WORDS =
  'Done — this device has a new key. Your other devices will not sync with it until you pair them again with the new one.';
