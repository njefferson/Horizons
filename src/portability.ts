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
 *  backups is legible without opening them (data-constitution). */
export const exportFilename = (scope: string, at: string, encrypted: boolean): string =>
  `planner-${scope}-${at.replace(/[:.]/g, '-')}${encrypted ? '-encrypted' : ''}.json`;

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

/**
 * Seed a FRESH store from an export. Destructive by design and by name: the
 * caller is expected to have confirmed with the user first.
 *
 * The snapshot in the file is deliberately NOT trusted here — state is folded
 * from the log. That keeps the log authoritative and means a bad snapshot can
 * never corrupt an import.
 */
export async function importSeedingFresh(store: LogStore, file: ExportFile): Promise<{ events: number }> {
  if (file.format !== 'planner-log') throw new Error(`not a planner export: format "${file.format}"`);
  if (file.version !== 1) throw new Error(`unsupported export version ${file.version}`);

  const events = fromJsonl(file.logJsonl);

  await store.reset();          // seeds fresh — never merges
  await store.append(events);

  // Recompute rather than trusting the file's snapshot.
  const state = fold(events);
  await store.putSnapshot({
    upToSeqByDevice: Object.fromEntries(state.seqByDevice),
    state: serialiseState(state),
    at: file.at,
  });

  return { events: events.length };
}
