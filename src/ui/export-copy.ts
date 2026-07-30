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
