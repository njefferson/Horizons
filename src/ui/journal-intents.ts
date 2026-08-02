// Writing to the journal (1.13.0, ADR-0061).
//
// Two shapes, and the asymmetry between them is the whole design:
//
//   `sealJournalEvents` is written ONCE, when a passphrase is first set. It
//   records the salt and the work factor so a second device can derive the same
//   key from the same passphrase.
//
//   `entryEvents` is written every time somebody writes something, and it takes
//   ALREADY-SEALED bytes. This module never sees a key and never sees
//   plaintext — the caller seals first and hands the envelope over, so a bug
//   here cannot leak an entry into an event, and reading this file tells you
//   nothing about anybody's journal.
//
// These build events; they never touch the store.

import type { AppEvent, NodeId } from '../events.ts';
import type { Sealed } from '../seal.ts';
import type { StampContext } from './session.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * Record how this journal's key is derived. Written once, at the moment the
 * passphrase is chosen, and never again — there is no passphrase change in this
 * release, because changing it means re-sealing every entry, and in an
 * append-only log that means writing every entry a second time. Half-building
 * that would be worse than not offering it (ADR-0061).
 */
export const sealJournalEvents = (
  ctx: StampContext, salt: string, iterations: number,
): AppEvent[] => [base(ctx, 'journal.sealed', null, { salt, iterations })];

/**
 * One entry: a node of kind `journal`, and the sealed body on it.
 *
 * The node is created with **no title**. A title would be plaintext in the
 * log — the one place a journal must never leak — and there is no version of
 * "just the first few words" that is safe. So an entry has nothing readable
 * about it anywhere except inside the envelope.
 *
 * `journal` is demand-free (1.13.0), so the gate needs no clock to accept this
 * and adds none: an entry does not come back at you as work.
 */
export const entryEvents = (
  ctx: StampContext, id: NodeId, sealed: Sealed,
): AppEvent[] => [
  base(ctx, 'node.created', id, { nodeKind: 'journal', title: '' }),
  base(ctx, 'journal.entry.written', id, { v: sealed.v, iv: sealed.iv, ct: sealed.ct }),
];
