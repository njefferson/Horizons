// The diagnostic report — text you can send when something is wrong
// (1.18.0, Doctrine §7f, ADR-0071).
//
// ## Why this exists, and why it was owed
//
// (Owed, not the other word — the banned-vocabulary gate caught this comment
// on its first run, correctly. `people.ts` records the same trap from Phase 3:
// the comment gets reworded, never the gate widened.)
//
// `docs/data-constitution.md` has promised this to the reader since it was
// written: *"If something breaks, you may choose to copy a diagnostic report.
// It is generated on request, shown to you in full before it goes anywhere, and
// you send it."* Nothing built it. The only diagnostic in the app was the build
// stamp in the footer, whose own comment calls itself one. A commitment the
// product makes to its reader and does not keep is the 1.9.1 class exactly.
//
// Doctrine §7f then made it a rule for every app: **ask for the diagnostic,
// never for a screenshot.** A photograph of a screen loses every reason string
// and cannot show internal state at all — and reports come from an iPad, where
// every outstanding verification in this repo has to be run.
//
// ## THE RULE THIS MODULE IS BUILT AROUND: shape, never content
//
// Other apps' diagnostics worry about location. This one's worry is the
// opposite and sharper. Quietkeep's entire promise is that nothing readable
// leaves the device, and it holds an encrypted journal. A report carrying
// titles, people's names, notes or entry text would break that promise **in a
// file whose whole purpose is to be sent to somebody** — the one artefact in
// the app designed to leave.
//
// So this reports counts, kinds, clock kinds, versions, storage numbers and
// states. **Never a title, never a name, never a note, never plaintext.** It is
// the `reentry.greeted` correction from 1.17.4 restated as a design rule:
// record WHETHER and HOW MANY, never WHICH. `test/diagnostic.test.ts` sweeps a
// store full of distinctive strings and asserts none of them appears here, so
// the rule is falsifiable rather than merely intended.
//
// **And therefore no opt-in to include content.** §7f asks for coarsening with
// an explicit opt-in to include the precise thing; the honest answer here is
// that there is no diagnostic question a title would answer. When a specific
// defect needs the data, **the export already IS the reproduction case** — the
// constitution says so in the same paragraph, and `deliverCopy` builds it. This
// report points at that instead of duplicating it, and says so in its own
// words rather than leaving it implied.
//
// ## It leads with the diagnosis (§7f)
//
// Root causes first, separated from what they knocked over, and it says what is
// MISSING and why rather than merely that it is missing. A silent node is not a
// symptom — it is law 1 failing, and everything downstream of it is consequence.
//
// PURE. Every reading is an argument: no storage, no clock, no DOM, no
// `navigator`. The UI gathers, this shapes.

import { NODE_KINDS, type ClockKind, type NodeKind } from './events.ts';
import type { AppEvent } from './events.ts';
import type { State } from './fold.ts';
import { coverageGauge, heldNodes, silentNodes, trashedNodes } from './gate.ts';
import { changesSinceCopy, copyDayWords, lastCopy } from './copies.ts';
import { journalSeal } from './journal.ts';
import { menuCount } from './menu.ts';
import { notNowLedger } from './requests.ts';
import { loadNow } from './load.ts';
import { isReadyAgain, pressureOf, pressureWords } from './pressure.ts';
import { recordDayWords } from './time.ts';

/** What the UI has to go and find out. Every one of these is a fact about the
 *  DEVICE rather than about the data, which is why they arrive as arguments —
 *  this module cannot read a browser and must not learn how. */
export interface DeviceReading {
  /** The release triplet, from `changelog.ts` CURRENT. */
  triplet: string;
  /** Which build: the default edition cannot sync at all (ADR-0036). `null`
   *  when the hostname does not answer it — localhost, or anywhere the
   *  two-project pattern does not hold. `editionOf` returns null there and
   *  this passes it through rather than guessing "default", which would be a
   *  claim about network capability made from no evidence. */
  edition: 'default' | 'sync' | null;
  /** The service-worker cache name, which carries the triplet and is the
   *  fastest way to see a device serving a stale build. Null when the worker
   *  has not answered — an ordinary state, and said as one. */
  cache: string | null;
  /** EVERY Quietkeep cache this device holds, not just the first. Two is the
   *  signature of a half-finished update, and a report naming one cache cannot
   *  show it (§7h.4). */
  caches: string[];
  /** Is a service worker controlling this page at all? A page with no
   *  controller is serving straight from the network, which changes what every
   *  other line here means. */
  controlled: boolean;
  /** Is a NEWER worker installed and waiting for the reader to accept it? This
   *  is the state that tells "running the current build" from "running an old
   *  build with the new one already downloaded" — which the triplet above
   *  cannot, because it is whatever the cache served (§7f, §7h). */
  waiting: boolean;
  /** WHICH SITE this report came from. Added after a report read
   *  `quietkeep-sync-1.18.0` and could not settle whether it came from
   *  production or staging, because both served that build — it cost V-15 a
   *  round trip on a line that costs nothing. A report that cannot say where it
   *  came from cannot close a verification on its own. */
  origin: string | null;
  device: string;
  zone: string;
  /** Home-screen or browser tab. The install steps and the persistence story
   *  both turn on this, so a report that omits it invites the wrong advice. */
  installed: boolean;
  /** `navigator.storage` answers, as `paintStorage` already reads them. */
  storageSupported: boolean;
  persisted: boolean;
  quotaMb: number | null;
  usageMb: number | null;
  /** Is there a pairing key on this device? Asked of the store by the caller,
   *  never of the sync module — this file ships in both editions. */
  paired: boolean;
  /** Journal entries that would not decrypt, counted by the caller because
   *  only it holds the key. Null when the journal is locked or unset, which is
   *  NOT the same fact as zero and is not reported as one. */
  unreadableEntries: number | null;
}

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * What is WRONG, first — and why, not merely that.
 *
 * Ordered by what causes what. A silent node means the write boundary let
 * something through that no surface shows, which is law 1 failing and is a
 * cause; a missing copy is a risk; a stale cache explains "the fix you sent me
 * is not here". Each line says the reason, because a diagnostic that lists
 * absences without reasons is a screenshot in text form.
 *
 * Empty is a real answer and gets said plainly rather than left blank.
 */
export function findings(state: State, log: readonly AppEvent[], r: DeviceReading): string[] {
  const out: string[] = [];

  const silent = silentNodes(state);
  if (silent.length > 0) {
    // The verb agrees with the count. "31 things in this store is on no
    // surface" was the first sentence this report ever produced in anger, and
    // it read as though the app could not count — on the one line whose whole
    // job is to be believed. Caught by reading a real report, not by a test.
    out.push(`LAW 1 IS BROKEN — ${plural(silent.length, 'thing', 'things')} in this store `
      + `${silent.length === 1 ? 'is' : 'are'} on no surface, under no clock, on no Menu, `
      + 'and parented to nothing under a clock. '
      + 'The write boundary is supposed to make that impossible, so this is a cause and not a '
      + 'symptom: anything else odd in this report may be downstream of it. '
      + `Kinds affected: ${[...new Set(silent.map(n => n.kind))].sort().join(', ')}.`);
  }

  if (r.unreadableEntries !== null && r.unreadableEntries > 0) {
    out.push(`${plural(r.unreadableEntries, 'journal entry', 'journal entries')} would not open `
      + 'with the passphrase given. The entries are still in the log — this is a decryption '
      + 'failure, not a deletion, and a wrong passphrase looks exactly like this.');
  }

  if (!r.storageSupported) {
    out.push('This browser does not report on storage at all, so whether it will keep your '
      + 'planner cannot be read from here. The copy in Files is the durable one.');
  } else if (!r.persisted) {
    out.push('The browser has NOT agreed to keep this planner, so it may clear the store on '
      + 'its own to make room. On iPhone and iPad, adding Quietkeep to the home screen and '
      + 'allowing the notification prompt is what grants this.');
  }

  const copy = lastCopy(log);
  if (!copy) {
    out.push('No copy has ever left this device. Everything here exists in one place, and '
      + 'clearing website data would take it.');
  } else if (changesSinceCopy(log, copy)) {
    out.push(`There is work here that no copy holds — the newest copy is from `
      + `${copyDayWords(copy, r.zone)}.`);
  }

  if (r.cache !== null && !r.cache.endsWith(r.triplet)) {
    out.push(`The service worker is serving cache "${r.cache}" while this build is `
      + `${r.triplet}. A device in this state is running older code than the version stamp `
      + 'claims, which is how a fixed defect appears to still be present.');
  }

  // §7h. Said in the diagnosis and not only in the device block, because the
  // whole point of this release is that a reader should never have to open a
  // report to find out they are running last week's build. This line is the
  // backstop for the case where they did open one.
  if (r.waiting) {
    out.push('A newer version is downloaded and waiting on this device. Nothing installs '
      + 'until you choose it, so what you are using now is whole and keeps working — but '
      + 'a defect you are about to report may already be fixed in the copy sitting here.');
  }
  if (r.caches.length > 1) {
    out.push(`This device holds ${r.caches.length} copies of the app (${r.caches.join(', ')}). `
      + 'One of them is left over from an update that did not finish clearing up. It is '
      + 'harmless, and it is the fingerprint worth reporting.');
  }

  return out;
}

/** The node-kind histogram — the shape of what is held, with no titles in it.
 *  Every kind is listed including the zeroes: "no journal entries" is a fact
 *  somebody diagnosing a journal problem needs, and an omitted row reads as an
 *  oversight rather than as a zero. */
export function kindCounts(state: State): Record<NodeKind, number> {
  const counts = Object.fromEntries(NODE_KINDS.map(k => [k, 0])) as Record<NodeKind, number>;
  for (const n of state.nodes.values()) {
    if (n.kind in counts) counts[n.kind as NodeKind] += 1;
  }
  return counts;
}

/** Which clock kinds are in use, and how many of each. Clock kinds are the
 *  app's whole temporal vocabulary, so "which clocks exist here" is the first
 *  question about anything that came back at the wrong time. */
export function clockCounts(state: State): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of state.nodes.values()) {
    for (const k of Object.keys(n.clocks) as ClockKind[]) {
      if (n.clocks[k]) out[k] = (out[k] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * The whole report, as text.
 *
 * Sections in the order §7f asks for: the diagnosis, then the device, then the
 * shape of the store, then what has happened to it — and last, plainly, what
 * this report deliberately does not contain, because a reader about to send a
 * file deserves to know what is in it before they do.
 */
/** The five bands `pressureWords` speaks, in the order insistence rises. Named
 *  here so the report cannot invent a sixth or reorder them by accident. */
const BANDS = ['settled', 'coming round', 'ready again', 'been a while', 'been a good while'] as const;

/**
 * What the surfaces OPENED WITH — the count of things that have come round
 * again, and how long they have been waiting, in the app's own words.
 *
 * WHY THIS IS IN THE REPORT, and it is the most important thing here.
 *
 * The v1 definition of done is the dogfood gate: thirty consecutive working
 * days run from the app's views. It has been running the whole time and the app
 * has been losing (LESSONS §40 — an absent record of success is not an absent
 * attempt). This repo held no data about WHY, because sessions asked for
 * promotes and on-device passes instead of asking what ended the day.
 *
 * The first real report, 2026-08-04, showed 1,432 held and `review 1275` under
 * "clocks in use" — and that number cannot answer the question, because clocks
 * IN USE counts clocks that EXIST, not ones that are asking. A day that ends
 * early is a day whose surface opened with more on it than a person can face,
 * and nothing in this app could say what that surface showed.
 *
 * **No cliff, and no new vocabulary.** This counts `isReadyAgain` and buckets by
 * `pressureWords`, which are the same primitive and the same five phrases the
 * UI already speaks — deliberately gentle at the top end, because past a point
 * an exact number is not something a person can act on and naming it precisely
 * reads as an accusation (ADR-0010). There is no "overdue" here and there will
 * not be one.
 */
export function pressureBands(
  state: State, nowIso: string, zone: string,
): { bands: Record<string, number>; readyAgain: number; withClock: number; withoutClock: number } {
  const bands: Record<string, number> = Object.fromEntries(BANDS.map(b => [b, 0]));
  let readyAgain = 0, withClock = 0, withoutClock = 0;
  for (const n of heldNodes(state)) {
    const p = pressureOf(n, nowIso, zone);
    // `null` is not a failure and not a zero: an item with no cadence ranks by
    // its own clock instead, and counting it as comfortable would overstate how
    // settled the store is (LESSONS §23 — "the source gave me null" is not the
    // same fact as "this is unknowable").
    if (p === null || !Number.isFinite(p)) { withoutClock += 1; continue; }
    withClock += 1;
    if (isReadyAgain(p)) readyAgain += 1;
    const w = pressureWords(p);
    if (bands[w] !== undefined) bands[w] += 1;
  }
  return { bands, readyAgain, withClock, withoutClock };
}

export function diagnosticReport(
  state: State, log: readonly AppEvent[], r: DeviceReading, nowIso: string,
): string {
  const L: string[] = [];
  const gauge = coverageGauge(state);
  const seal = journalSeal(log);
  const load = loadNow(state);

  L.push('QUIETKEEP — DIAGNOSTIC REPORT');
  L.push(`Taken ${recordDayWords(nowIso, r.zone, nowIso)} · build ${r.triplet} · ${r.edition ?? 'unrecognised'} edition`);
  L.push('');

  L.push('WHAT IS WRONG');
  const found = findings(state, log, r);
  if (found.length === 0) {
    L.push('  Nothing this report can see. That does not mean nothing is wrong —');
    L.push('  it means none of the things the app knows how to check for is.');
  } else {
    for (const f of found) L.push(`  - ${f}`);
  }
  L.push('');

  L.push('THIS DEVICE');
  L.push(`  Build: ${r.triplet}`);
  L.push(`  Edition: ${r.edition === 'default' ? 'default (cannot sync — no network code in this build)'
    : r.edition === 'sync' ? 'sync'
    : 'cannot be told from this address — a local build, or an unexpected host'}`);
  L.push(`  Address: ${r.origin ?? 'not answering'}`);
  L.push(`  Service worker cache: ${r.cache ?? 'not answering'}`);
  if (r.caches.length > 1) {
    L.push(`  Caches held: ${r.caches.length} — ${r.caches.join(', ')}`);
    L.push('    (more than one means an update is part-finished on this device)');
  }
  L.push(`  A worker is serving this page: ${r.controlled ? 'yes' : 'no — straight from the network'}`);
  L.push(`  A newer version is waiting to be installed: ${r.waiting ? 'yes' : 'no'}`);
  L.push(`  Installed to home screen: ${r.installed ? 'yes' : 'no — running in a browser tab'}`);
  L.push(`  This store's id: ${r.device}`);
  L.push('    (one per site and per browser, not per machine — the same iPad');
  L.push('     has a different one for each edition, and a fresh one after a clear)');
  L.push(`  Time zone: ${r.zone}`);
  L.push(`  Paired with another device: ${r.paired ? 'yes' : 'no'}`);
  L.push('');

  L.push('STORAGE');
  L.push(`  Browser reports on storage: ${r.storageSupported ? 'yes' : 'no'}`);
  L.push(`  Browser has agreed to keep it: ${r.persisted ? 'yes' : 'no'}`);
  L.push(`  Room available: ${r.quotaMb == null ? 'unknown' : `${r.quotaMb} MB`}`);
  L.push(`  Used by Quietkeep: ${r.usageMb == null ? 'unknown' : `${r.usageMb} MB`}`);
  L.push('');

  L.push('WHAT IT IS HOLDING');
  // Both numbers, because 1.15.1 made them different questions and a report
  // giving one invites the wrong conclusion about the other.
  L.push(`  Held as work (what the gauge counts): ${gauge.total}`);
  L.push(`  Held altogether (people, weights, entries, periods included): ${heldNodes(state).length}`);
  L.push(`  On no surface at all (must be 0): ${gauge.silent}`);
  L.push(`  Let go: ${trashedNodes(state).length}`);
  L.push(`  On the Menu: ${menuCount(state)}`);
  L.push(`  In the Not Now ledger: ${notNowLedger(state).length}`);
  L.push(`  Weights being carried: ${load.pebbles.length}${load.capacity ? ` · capacity said to be ${load.capacity}` : ''}`);
  L.push(`  Events in the log: ${state.eventCount}`);
  L.push(`  Stores seen in the log: ${state.devices.size}`);
  L.push('  By kind:');
  const counts = kindCounts(state);
  for (const k of NODE_KINDS) L.push(`    ${k}: ${counts[k]}`);
  const clocks = clockCounts(state);
  L.push(`  Clocks in use: ${Object.keys(clocks).length === 0
    ? 'none'
    : Object.entries(clocks).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  L.push('');

  // The line above counts clocks that EXIST. This one counts what is ASKING,
  // which is a different number and the one that explains a day ending early.
  const pb = pressureBands(state, nowIso, r.zone);
  L.push('WHAT HAS COME ROUND AGAIN');
  L.push(`  Ready again now: ${pb.readyAgain} of ${pb.withClock} that carry a clock`);
  if (pb.withoutClock > 0) {
    L.push(`  Held without a clock: ${pb.withoutClock} (they rank by their own, not by pressure)`);
  }
  if (pb.withClock > 0) {
    L.push('  How long they have been waiting, in the words the app uses:');
    for (const b of BANDS) L.push(`    ${b}: ${pb.bands[b]}`);
  }
  L.push('');

  L.push('THE RECORD');
  const copy = lastCopy(log);
  L.push(`  Last whole copy: ${copyDayWords(copy, r.zone)}`);
  L.push(`  Work since that copy: ${changesSinceCopy(log, copy) ? 'yes' : 'no'}`);
  L.push(`  Journal: ${seal ? 'a passphrase is set' : 'not set up'}`);
  L.push(`  Entries that would not open: ${r.unreadableEntries === null
    ? 'not checked — the journal is locked or unset' : r.unreadableEntries}`);
  L.push('');

  // Said HERE, at the moment of sending, not in a help section somebody read
  // last week. A person about to hand a file to another person is entitled to
  // know what is in it, from the file itself.
  L.push('WHAT THIS REPORT DOES NOT CONTAIN');
  L.push('  Nothing you wrote. No titles, no names, no notes, no journal text —');
  L.push('  only counts and states. That is deliberate and there is no setting to');
  L.push('  change it: nothing that could be diagnosed from a title cannot be');
  L.push('  diagnosed from the counts above. If a specific problem needs the');
  L.push('  actual data, the ordinary export under "Your data" is a complete');
  L.push('  reproduction case — send that instead, and only if you want to.');

  return L.join('\n');
}
