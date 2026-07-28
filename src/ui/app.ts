// Quietkeep — the shell and the Dump surface.
//
// Phase 1 item 8: zero chrome, one line per card, drafts persisted per
// keystroke. Capture comes before anything that displays it, because an app
// that captures and does nothing else is already useful and the reverse is not
// (build-plan §3).
//
// This file reads state and emits intents. It never touches the log — every
// write goes through `session.commit`, which goes through the gate.

import { openSession, captureEvent, type Session } from './session.ts';
import type { AppEvent } from '../events.ts';
import { coverageGauge } from '../gate.ts';
import type { NodeState } from '../fold.ts';
import { mountAbout } from './about.ts';
import { mountTriage } from './clarify.ts';

const now = () => Date.now();

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

/** Newest first. Capture order is the only order this surface claims. */
const captured = (s: Session): NodeState[] =>
  [...s.state().nodes.values()]
    .filter(n => !n.trashed)
    .sort((a, b) => (a.id < b.id ? 1 : -1));

function render(session: Session): void {
  const list = $('#cards');
  const items = captured(session);

  list.replaceChildren(...items.map(node => {
    const li = document.createElement('li');
    li.className = 'card';

    const title = document.createElement('span');
    title.className = 'card-title';
    // textContent, never innerHTML: captured text is stored as text and never
    // interpreted, which is what makes /capture?text= safe from a hostile link
    // (ADR-0008).
    title.textContent = node.title;

    const when = document.createElement('span');
    when.className = 'card-when';
    const clock = node.clocks.due ?? node.clocks.review ?? node.clocks.start;
    // Every item states its own status in words — the text channel of B-01, so
    // nothing here depends on seeing a colour.
    when.textContent = clock ? `returns ${friendly(clock.at)}` : 'held';

    li.append(title, when);
    return li;
  }));

  $('#empty').hidden = items.length > 0;

  // The gauge reads as text first and the number is the information (B-02).
  const { silent, total } = coverageGauge(session.state());
  $('#gauge').textContent =
    total === 0 ? 'nothing held yet' : `${total} held · ${silent} silent`;
}

/** Plain words, one idea, no idioms (B-09). Never a countdown, never a rebuke. */
function friendly(iso: string): string {
  const then = new Date(iso);
  const days = Math.round((then.getTime() - now()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function main(): Promise<void> {
  const session = await openSession(now);
  const input = $<HTMLInputElement>('#capture');
  const status = $('#status');

  input.value = await session.draft();
  render(session);

  // The triage surface (heat pass + clarify). It re-renders the held list when
  // it moves an item, and capture refreshes it (a new item joins the inbox).
  const triage = mountTriage(session, () => render(session));

  // Three URL entrances, all landing in the same capture (ADR-0008):
  //  - ?capture=1     the manifest shortcut — just focus the empty line
  //  - ?text=         the documented public endpoint (a hostile link can reach it)
  //  - share target   ?title=&text=&url= from the OS share sheet (Chromium)
  // Each is a public surface, so each does the ONE thing it may — create a single
  // unclarified item — with a visible confirm and undo; none can set a clock,
  // route, complete, or delete. Text is stored as text and shown with textContent.
  await handleUrlEntrances(session, status, input);
  triage.refresh();

  // Per keystroke. An interruption mid-capture is the EXPECTED case for this
  // audience, not the edge case (ADR-0008).
  input.addEventListener('input', () => { void session.setDraft(input.value); });

  $<HTMLFormElement>('#capture-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Clear SYNCHRONOUSLY, never disable. Disabling blurred the field for the
    // whole commit window — dropping keystrokes and, on iPadOS, dismissing the
    // keyboard with no guaranteed return — and the un-cleared text made a
    // double-tap capture the same thought twice (audit). With the input empty,
    // a second submit in the window reads '' and no-ops.
    input.value = '';

    let landed = false;
    try {
      // Commit BEFORE the UI confirms (ADR-0008).
      await session.commit(ctx => captureEvent(ctx, text, 'quick'));
      landed = true;
    } catch (err) {
      // The write failed: give the thought back, and say so.
      input.value = text;
      status.textContent = `Not saved — ${(err as Error).message}`;
      input.focus();
      return;
    }

    // From here the write IS in the log. Nothing below may un-say that: the
    // audit showed a post-commit throw landing in a shared catch and telling
    // the user "Not saved" about a thought that was saved — who then retypes
    // it and gets a duplicate. Confirmation first, housekeeping after, each
    // failure contained.
    status.textContent = 'Held. It will come back to you.';
    void session.setDraft('').catch(() => { /* stale draft self-heals on next keystroke */ });
    try {
      render(session);
      triage.refresh();
    } catch {
      // A render bug must not contradict a landed write; the card appears on
      // next load. landed stays the truth.
    }
    if (landed) input.focus();
  });

  // Opens itself on a first run — a new user has no way to know that storage
  // needs asking for — and never uninvited after that. Contained: a failure
  // here must not take capture down with it, or block readiness.
  try {
    await mountAbout(session);
  } catch {
    // The (i) failing is a lost nicety; capture still works.
  }

  // The store is open, state is folded, and the surface reflects it. Marked on
  // the document so the headless walk waits for the app rather than for `load`,
  // which fires while this function is still awaiting IndexedDB.
  document.body.dataset.ready = 'true';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is an enhancement; failing to register is not a reason
      // to break capture, which is the one thing that must always work.
    });
  }
}

/** Compose one capture from whatever a share sheet handed over. Title, text and
 *  URL can each be present or absent; the result is the parts that exist, joined,
 *  trimmed — never the literal string "undefined" and never a blank line. */
function composeShared(title: string, text: string, url: string): string {
  return [title, text, url].map(s => s.trim()).filter(Boolean).join('\n').trim();
}

/** The three URL entrances. Captures at most once, offers an undo, and scrubs
 *  the query from the address bar so a refresh cannot re-fire it. */
async function handleUrlEntrances(session: Session, status: HTMLElement, input: HTMLInputElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const clean = location.pathname + location.hash;

  // The manifest shortcut: no capture, just land ready to type.
  if (params.get('capture') === '1') {
    history.replaceState(null, '', clean);
    input.focus();
    return;
  }

  const title = params.get('title') ?? '';
  const url = params.get('url') ?? '';
  const rawText = params.get('text') ?? '';
  const shared = Boolean(title || url);            // share sheet sends these; the bare endpoint does not
  const text = shared ? composeShared(title, rawText, url) : rawText.trim();
  if (!text) return;

  // Scrub first, so a failure or a refresh cannot fire it twice.
  history.replaceState(null, '', clean);

  const source = shared ? 'share-target' : 'url-endpoint';
  let capturedNode: string | null = null;
  try {
    await session.commit(ctx => {
      const events = captureEvent(ctx, text, source);
      capturedNode = events[0]!.node;
      return events;
    });
  } catch (err) {
    status.textContent = `Couldn’t hold that — ${(err as Error).message}`;
    return;
  }

  render(session);

  // Visible confirm with an undo — a drive-by capture is never silent and never
  // permanent. Undo trashes the one node this created and nothing else.
  status.replaceChildren();
  status.append(document.createTextNode('Held from a link. '));
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'linklike';
  undo.textContent = 'Undo';
  undo.addEventListener('click', async () => {
    undo.disabled = true;
    try {
      await session.commit(ctx => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'node.trashed', node: capturedNode,
        payload: { reason: 'undo url-capture' },
      } as AppEvent]);
      render(session);
      status.textContent = 'Undone.';
    } catch (err) {
      status.textContent = `Couldn’t undo — ${(err as Error).message}`;
    }
  });
  status.append(undo);
}

void main().catch((err: unknown) => {
  const status = document.querySelector('#status');
  if (status) status.textContent = `Quietkeep could not start — ${(err as Error).message}`;
});
