// Export and import.
//
// Exports are immutable and timestamped; an export never overwrites an earlier
// one. The content is THE LOG (plus a snapshot for fast restore) — not a
// rendering of current state, because a state snapshot alone would silently
// discard everything that led to it (ADR-0006).
//
// RESTORING ALWAYS SEEDS A FRESH STORE. There is no merge, no "smart import",
// no conflict UI, and no `import.merged` event — adding one would break law 9.
//
// FOLDING IN ANOTHER DEVICE'S SHARD is a different operation and is additive
// (ADR-0035). It is not the merge law 9 forbids: that means resolving two
// versions of one state, which cannot be done honestly. This is the union of
// single-writer shards, which is what ADR-0003 has always said the fold is —
// each device writes only its own events, so two shards cannot disagree about
// what happened, and per-field last-writer-wins already settles what is
// currently true. The two operations are separate functions with separate
// controls saying separate things.

import type { AppEvent } from './events.ts';
import { isKnownKind } from './events.ts';
import type { LogStore, Snapshot } from './log-store.ts';
import { fold } from './fold.ts';
import { silentNodes, heldNodes, structuralRefusal } from './gate.ts';
import { serialiseState } from './snapshot.ts';
import { isValidIso, localDayKey, localParts } from './time.ts';

export interface ExportFile {
  format: 'planner-log';
  version: 1;
  at: string;
  scope: string;
  encrypted: boolean;
  /** JSON Lines: one event per line, UTF-8. Readable in any editor, greppable,
   *  and a truncated file loses one line rather than everything. */
  logJsonl: string;
  /** Optimisation only. Restore must work with this discarded. */
  snapshot: Snapshot | null;
}

export const toJsonl = (events: readonly AppEvent[]): string =>
  events.map(e => JSON.stringify(e)).join('\n');

export function fromJsonl(jsonl: string): AppEvent[] {
  const out: AppEvent[] = [];
  const lines = jsonl.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A truncated file loses ONE line. Say which, and refuse to guess at it.
      throw new Error(`export line ${i + 1} is not valid JSON — file may be truncated`);
    }
    const e = parsed as AppEvent;
    if (!isKnownKind(e.kind)) {
      throw new Error(`export line ${i + 1} carries unknown kind "${e.kind}" — the vocabulary is a closed list`);
    }
    out.push(e);
  }
  return out;
}

/** Filename carries vault, timestamp and encryption status, so a folder of
 *  backups is legible without opening them (data-constitution).
 *
 *  The prefix is the product name — a backup found years later should say what
 *  it came from. The `format` field inside the file stays `planner-log`: that
 *  is a data-format identifier, and changing it would orphan every export
 *  already written for zero benefit. */
export const exportFilename = (
  scope: string,
  at: string,
  encrypted: boolean,
  ext = 'json',
  zone?: string,
): string => {
  // The stamp in the NAME must agree with the day stated INSIDE the file.
  //
  // It did not. The name carried the UTC instant while the contents said the
  // local day (`madeOn` in `src/ics.ts`), so a calendar export taken at seven in
  // the evening anywhere west of Greenwich was named 2026-07-30 and said "as of
  // 2026-07-29". One artifact, two dates, and the name is the part a person sees
  // in Files. Found because a pinned-zone smoke check disagreed with a UTC one
  // at exactly the hour the two diverge — and it had been wrong every evening
  // since it was written.
  let stamp = at.replace(/[:.]/g, '-');
  if (zone !== undefined && isValidIso(at)) {
    const p = localParts(at, zone);
    const two = (n: number): string => String(n).padStart(2, '0');
    stamp = `${localDayKey(at, zone)}T${two(p.hour)}-${two(p.minute)}-${two(p.second)}`;
  }
  return `quietkeep-${scope}-${stamp}${encrypted ? '-encrypted' : ''}.${ext}`;
};

export async function exportAll(store: LogStore, at: string, scope = 'all'): Promise<ExportFile> {
  const events = await store.all();
  return {
    format: 'planner-log',
    version: 1,
    at,
    scope,
    encrypted: false,
    logJsonl: toJsonl(events),
    snapshot: await store.latestSnapshot(),
  };
}

/** What a file turns out to be, said in a way a surface can render. */
export interface ExportSummary {
  /** Empty when the file can be imported. Otherwise the reasons, in plain
   *  words, ready to show — never an exception the surface has to phrase. */
  refusals: string[];
  events: number;
  /** How many things a person would actually see afterwards. `events` is a
   *  number about the log; this is a number about their life. */
  items: number;
  /** When the file was made, or null when it does not say. */
  at: string | null;
  scope: string | null;
}

/**
 * Read a file and describe it WITHOUT touching anything.
 *
 * **Never throws.** A corrupt or hostile file is an answer, not an exception:
 * the person chose a file and deserves to be told what is wrong with it, before
 * anything of theirs is at risk. `importSeedingFresh` asks this same function,
 * so the preview and the import cannot come to different conclusions about what
 * a file is — the failure mode where a surface says "412 items, ready" and the
 * import then refuses is worse than either answer alone.
 */
export function inspectExport(raw: unknown): ExportSummary {
  const empty: ExportSummary = { refusals: [], events: 0, items: 0, at: null, scope: null };
  if (raw === null || typeof raw !== 'object') {
    return { ...empty, refusals: ['That file is not a Quietkeep export — it is not even a record.'] };
  }
  const f = raw as Partial<ExportFile>;
  const at = typeof f.at === 'string' ? f.at : null;
  const scope = typeof f.scope === 'string' ? f.scope : null;
  if (f.format !== 'planner-log') {
    return { ...empty, at, scope, refusals: [`That is not a Quietkeep export — it says its format is "${String(f.format)}".`] };
  }
  if (f.version !== 1) {
    return { ...empty, at, scope, refusals: [`That export is version ${String(f.version)}, which this app cannot read.`] };
  }
  if (typeof f.logJsonl !== 'string') {
    return { ...empty, at, scope, refusals: ['That export has no log in it, so there is nothing to bring back.'] };
  }
  try {
    return describe(f, at, scope);
  } catch (err) {
    // THE WHOLE BODY, not just the parse. `fold` reads payload fields
    // unguarded — `payload: null` on a `vault.created` line threw a TypeError
    // straight out of here, and the surface, which had only wrapped
    // `JSON.parse`, sat on "Reading it…" for ever with an uncaught error in the
    // console (audit). This function's contract is that a bad file is an answer.
    // Plain sentence first, technical detail in brackets after it. The raw
    // message here is whatever threw — "Cannot read properties of null" is not
    // a thing to lead with when someone is trying to get their data back, but it
    // is worth keeping for anyone who opens the file to see what happened.
    return {
      refusals: [`That file is damaged — one of its records could not be read. (${(err as Error).message})`],
      events: 0, items: 0, at, scope,
    };
  }
}

function describe(f: Partial<ExportFile>, at: string | null, scope: string | null): ExportSummary {
  const empty: ExportSummary = { refusals: [], events: 0, items: 0, at, scope };
  let events: AppEvent[];
  try {
    events = fromJsonl(f.logJsonl as string);
  } catch (err) {
    // WRAPPED, not passed through. `fromJsonl`'s messages are precise and are
    // written for whoever is debugging — "export line 4 carries unknown kind" is
    // not a sentence to hand someone whose data has just gone wrong. The detail
    // is kept, because which line matters if they open the file; the sentence
    // around it is the part they read (Doctrine §5).
    return { ...empty, at, scope, refusals: [`That file could not be read in full (${(err as Error).message}).`] };
  }

  const refusals: string[] = [];

  // EVERY QUESTION THE STORE WILL ASK, asked here — while the user's data is
  // still intact. This is the check whose absence cost someone their store: a
  // file with two events sharing an id was described as "2 things, ready", and
  // the append then failed on the unique-id constraint AFTER the clear had run.
  // The person's real items were gone, replaced by whichever rows happened to
  // land first (audit, CRITICAL).
  const seen = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (typeof e.id !== 'string' || !e.id) {
      refusals.push(`That file is damaged — record ${i + 1} has no identifier.`);
      break;
    }
    if (seen.has(e.id)) {
      refusals.push(
        `That file is damaged — it carries the same record twice (id "${e.id}"). ` +
        'Two exports may have been joined together.');
      break;
    }
    seen.add(e.id);
    // The gate's own shape rules, from the one definition it uses. Import used
    // to ask none of them, so a negative or infinite `seq`, an unparseable date
    // or a `__proto__` field name went straight in.
    const bad = structuralRefusal(e);
    if (bad) {
      refusals.push(`That file cannot be brought back — record ${i + 1}: ${bad}.`);
      break;
    }
  }
  if (refusals.length > 0) {
    return { refusals, events: events.length, items: 0, at, scope };
  }

  // THE GATE'S OWN QUESTION, asked of the file. Import is a second write path
  // that does not go through `admit`, so a crafted file could seed silent nodes
  // (audit). A log this app produced cannot contain one, so a file that folds to
  // silence was altered or written by something else.
  const candidate = fold(events);
  const silent = silentNodes(candidate);
  if (silent.length > 0) {
    refusals.push(
      `That file is not a faithful Quietkeep export — ${silent.length} item(s) in it ` +
      `would be invisible (${silent.slice(0, 5).map(n => n.id).join(', ')}${silent.length > 5 ? ', …' : ''}).`);
  }
  return {
    refusals,
    events: events.length,
    items: heldNodes(candidate).length,
    at,
    scope,
  };
}

/**
 * Seed a FRESH store from an export. Destructive by design and by name: the
 * caller is expected to have confirmed with the user first.
 *
 * The snapshot in the file is deliberately NOT trusted here — state is folded
 * from the log. That keeps the log authoritative and means a bad snapshot can
 * never corrupt an import.
 */
export async function importSeedingFresh(store: LogStore, file: ExportFile): Promise<{ events: number }> {
  // VALIDATE BEFORE DESTROYING, through the same function the surface used to
  // describe the file. Re-checked here rather than trusted from the caller: this
  // is the destructive boundary, and a boundary that assumes someone else looked
  // is not a boundary.
  const summary = inspectExport(file);
  if (summary.refusals.length > 0) {
    throw new Error(`${summary.refusals[0]} Nothing was imported and your current data is untouched.`);
  }
  const events = fromJsonl(file.logJsonl);
  const candidate = fold(events);

  // ATOMIC. `reset()` then `append()` left a window in which the old data was
  // already gone and the new data had not all arrived — and a file that passed
  // validation still found it, through a constraint the validation did not ask
  // about. Validation now asks; this makes the window not exist either way,
  // because a quota or disk failure mid-append is not something validation can
  // ever rule out.
  await store.replaceAll(events);

  // Recompute rather than trusting the file's snapshot.
  const state = candidate;
  await store.putSnapshot({
    upToSeqByDevice: Object.fromEntries(state.seqByDevice),
    state: serialiseState(state),
    at: file.at,
  });

  return { events: events.length };
}

/**
 * Fold in ANOTHER DEVICE'S copy: take the events this store does not already
 * hold, and leave everything else exactly where it is (ADR-0035).
 *
 * **This is not a merge, and it is not `import.merged`.** That name means
 * resolving two versions of one state, and there is no honest way to do it —
 * which is why it is banned and stays banned. This is the union of SINGLE-WRITER
 * shards, which is what [ADR-0003](../docs/adr/0003-folder-mirror.md) has always
 * said the fold is. Each device only ever writes its own events, so two shards
 * cannot disagree about what *happened*; they can only disagree about what is
 * currently true, and per-field last-writer-wins over `(at, device, seq)` has
 * settled that since the spine was built.
 *
 * **Additive and non-destructive.** `importSeedingFresh` replaces and is the
 * right answer for restoring a device. This one never removes anything, so
 * running it on the wrong file costs nothing but a few events you did not want.
 * The two are separate controls saying separate things, because a person about
 * to press one of them is entitled to know which.
 *
 * Deletions travel, because a deletion is an event like any other.
 */
export async function foldInShard(
  store: LogStore,
  file: ExportFile,
  now: string,
): Promise<TakenIn> {
  const summary = inspectExport(file);
  if (summary.refusals.length > 0) {
    throw new Error(`${summary.refusals[0]} Nothing was taken in and your current data is untouched.`);
  }
  return takeInEvents(store, fromJsonl(file.logJsonl), now);
}

export interface TakenIn {
  taken: number;
  skipped: number;
  fromDevices: string[];
}

/**
 * The union itself, over raw events — shared by the "take in what I don't have"
 * button and by sync, because they are the same operation arriving by different
 * roads. A file on a memory stick and a chunk from a relay are both another
 * device's shard.
 *
 * ## Why this does NOT run the gate
 *
 * It looks like a missing safety check and it is the opposite. These events are
 * **already-gated history**: the gate ran on the device that wrote them, at the
 * moment it wrote them, and the cure it produced is IN the log beside its cause.
 * Running `admit` again here would, all three verified against the gate in
 * `test/take-in.test.ts` rather than reasoned about:
 *
 *   - mint a SECOND cure for each cause, carrying the same derived
 *     `<cause>~cure~<node>` id — not rejected, just written, and then refused by
 *     the store's unique index at the append;
 *   - refuse a shard taken in twice, as a creation landing on a node that
 *     already exists — the ordinary case for anyone using two devices;
 *   - refuse a `node.parented`, `dependency.declared` or `node.renamed` whose
 *     subject has not arrived yet, which is legal history split across chunks.
 *
 * Law 1 is preserved not by re-checking but because the log being folded in
 * already satisfies it, and the fold of two law-1-satisfying shards satisfies it
 * too: every node arrives with whatever put it on a surface. That is what makes
 * single-writer shards unionable at all (ADR-0003, ADR-0035).
 */
export async function takeInEvents(
  store: LogStore,
  incoming: readonly AppEvent[],
  now: string,
): Promise<TakenIn> {
  const mine = await store.all();

  // BY EVENT ID. The store's index is unique on id, so appending one it already
  // holds throws mid-write — the exact shape that cost a store its contents
  // before `replaceAll` existed. Filtering here means the append cannot fail on
  // a file that has simply been taken in twice, which is the ordinary case for
  // anyone actually using two devices.
  //
  // The id and NOT `device#seq`: a cure carries its cause's device and seq
  // (`gate.ts`, `cureFor`), so the coarser key would treat a capture's clock as
  // already held and drop it.
  const held = new Set(mine.map(e => e.id));
  const fresh = incoming.filter(e => !held.has(e.id));
  const fromDevices = [...new Set(fresh.map(e => e.device))].sort();

  if (fresh.length > 0) {
    await store.append(fresh);
    // Recompute from the WHOLE log, not from the incoming events alone. The
    // snapshot is an optimisation over everything the store holds, and one
    // written from a fragment would be a photograph of a store that never
    // existed.
    const state = fold(await store.all());
    await store.putSnapshot({
      upToSeqByDevice: Object.fromEntries(state.seqByDevice),
      state: serialiseState(state),
      at: now,
    });
  }
  return { taken: fresh.length, skipped: incoming.length - fresh.length, fromDevices };
}
