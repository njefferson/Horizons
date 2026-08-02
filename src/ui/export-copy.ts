// Handing a copy of the log over, in one place.
//
// This was a closure inside `mountAbout`, with a note on it saying a second copy of
// the logic "would be a second chance to get that ordering wrong". Then the update
// prompt needed the same thing, so it moved here rather than being written twice.
//
// ## The ordering is the whole point
//
// **DELIVER, then record.** An audit found the old order logging `export.written`
// before any file existed, so a failed export left the log asserting that a copy had
// left when none had — and the failure was silent. The file is built and handed to
// the browser first; the event is committed after. Each file therefore carries every
// EARLIER export's record and its own lands one export later, which is the honest
// consequence of doing it in the safe order.
//
// The long revoke grace is not caution for its own sake: on iPadOS the share sheet
// holds the object URL open while somebody decides where the file goes, and revoking
// promptly hands them an empty file.

import { exportAll, exportFilename } from '../portability.ts';
import { WHOLE_COPY_SCOPES } from '../copies.ts';
import type { AppEvent } from '../events.ts';
import type { Session } from './session.ts';

/** Two minutes. Long enough for a share sheet somebody wandered away from. */
const REVOKE_AFTER_MS = 120_000;

/**
 * Build the file, hand it over, then record it.
 *
 * Throws if anything fails, and says nothing itself — every caller has its own place
 * to put the words, and a helper that wrote to the DOM would have to know about all
 * of them.
 */
export async function deliverCopy(session: Session, scope = 'all', ext = 'json'): Promise<void> {
  // The scope is not a label here, it is the CLAIM the panel later reads back as
  // "Last copy" (1.14.0). `export.written` is one noun for three different acts —
  // this one, the range reading copy, and the calendar `.ics` — and only this one
  // produces something importable. So the whole-copy scopes live beside that
  // reader in `src/copies.ts` and this refuses anything outside them: a future
  // release adding a new whole-copy scope must name it there in the same commit,
  // rather than writing a copy the panel silently cannot see.
  if (!WHOLE_COPY_SCOPES.has(scope)) {
    throw new Error(`"${scope}" is not a whole-copy scope — add it to WHOLE_COPY_SCOPES or use deliverRangeCopy`);
  }
  const at = new Date().toISOString();
  const file = await exportAll(session.store, at, scope);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(scope, at, false, ext, session.zone);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);

  await session.commit((ctx) => [{
    id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
    kind: 'export.written', node: null,
    payload: { at, scope, encrypted: false },
  } as AppEvent]);
}

/**
 * A READING COPY of one range: these things and their history, verbatim
 * (1.5.0). Deliberately NOT an `ExportFile` and not importable — a range's
 * events in isolation cannot carry the coverage law 1 requires (the clocks
 * and parents that cover them live outside the range), so a seedable partial
 * file is not expressible; `inspectExport` refuses this format with honest
 * words, and law 9 stays untouchable by construction. Same deliver-then-record
 * ordering as every copy.
 */
export async function deliverRangeCopy(
  session: Session, ids: ReadonlySet<string>, scope: string,
): Promise<void> {
  const at = new Date().toISOString();
  const all = await session.store.all();
  const mine = all.filter(e => e.node !== null && ids.has(e.node));
  const file = {
    format: 'planner-range-copy', version: 1, at, scope,
    note: 'A reading copy of these things and their history. Not a backup and not importable — these events alone do not carry the coverage the store requires; "Export a copy" in the (i) panel is the whole-store way out.',
    logJsonl: mine.map(e => JSON.stringify(e)).join('\n'),
  };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename('range-copy', at, false, 'json', session.zone);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);

  await session.commit((ctx) => [{
    id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
    kind: 'export.written', node: null,
    payload: { at, scope, encrypted: false },
  } as AppEvent]);
}
