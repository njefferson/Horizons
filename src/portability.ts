// Export and import.
//
// Exports are immutable and timestamped; an export never overwrites an earlier
// one. The content is THE LOG (plus a snapshot for fast restore) — not a
// rendering of current state, because a state snapshot alone would silently
// discard everything that led to it (ADR-0006).
//
// IMPORT ALWAYS SEEDS A FRESH STORE. There is no merge, no "smart import", no
// conflict UI, and no `import.merged` event — adding one would break law 9.
// Merging is solved once, in the folder mirror, by single-writer shards
// (ADR-0003), and nowhere else.

import type { AppEvent } from './events.ts';
import { isKnownKind } from './events.ts';
import type { LogStore, Snapshot } from './log-store.ts';
import { fold } from './fold.ts';
import { silentNodes, heldNodes } from './gate.ts';
import { serialiseState } from './snapshot.ts';

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
export const exportFilename = (scope: string, at: string, encrypted: boolean, ext = 'json'): string =>
  `quietkeep-${scope}-${at.replace(/[:.]/g, '-')}${encrypted ? '-encrypted' : ''}.${ext}`;

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
  let events: AppEvent[];
  try {
    events = fromJsonl(f.logJsonl);
  } catch (err) {
    // WRAPPED, not passed through. `fromJsonl`'s messages are precise and are
    // written for whoever is debugging — "export line 4 carries unknown kind" is
    // not a sentence to hand someone whose data has just gone wrong. The detail
    // is kept, because which line matters if they open the file; the sentence
    // around it is the part they read (Doctrine §5).
    return { ...empty, at, scope, refusals: [`That file could not be read in full (${(err as Error).message}).`] };
  }

  // THE GATE'S OWN QUESTION, asked of the file. Import is a second write path
  // that does not go through `admit`, so a crafted file could seed silent nodes
  // (audit). A log this app produced cannot contain one, so a file that folds to
  // silence was altered or written by something else.
  const candidate = fold(events);
  const silent = silentNodes(candidate);
  const refusals: string[] = [];
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

  await store.reset();          // seeds fresh — never merges
  await store.append(events);

  // Recompute rather than trusting the file's snapshot.
  const state = candidate;
  await store.putSnapshot({
    upToSeqByDevice: Object.fromEntries(state.seqByDevice),
    state: serialiseState(state),
    at: file.at,
  });

  return { events: events.length };
}
