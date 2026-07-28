// The (i) panel — always available, and the first thing a new user sees.
//
// It is one surface doing three jobs, deliberately:
//   1. what this app is, in two lines
//   2. the storage question, with the action to answer it (V-00)
//   3. patch notes, per Doctrine §5 and §14
// plus the links every app in this family owes — the shared accessibility
// statement and the licence.
//
// It opens ITSELF the first time, because a new user has no way to know that
// storage needs asking for. After that it never opens uninvited; the (i) is
// always there. The first-run state lives in the kv store, not the log — whether
// someone has seen a dialog is not part of their history.

import { requestPersistence } from '../ids.ts';
import { RELEASES, CURRENT } from './changelog.ts';
import type { Session } from './session.ts';

const SEEN = 'about.seen';
const FIRST_GRANT = 'v00.firstGrant';

interface Reading {
  supported: boolean;
  persisted: boolean;
  quotaMb: number | null;
  usageMb: number | null;
}

async function read(): Promise<Reading> {
  const s = globalThis.navigator?.storage;
  if (!s?.persisted) return { supported: false, persisted: false, quotaMb: null, usageMb: null };
  const persisted = await s.persisted();
  let quotaMb: number | null = null;
  let usageMb: number | null = null;
  if (s.estimate) {
    const est = await s.estimate();
    quotaMb = est.quota ? Math.round(est.quota / 1_048_576) : null;
    usageMb = est.usage != null ? Math.round((est.usage / 1_048_576) * 10) / 10 : null;
  }
  return { supported: true, persisted, quotaMb, usageMb };
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export async function mountAbout(session: Session): Promise<void> {
  const dialog = document.querySelector<HTMLDialogElement>('#about');
  const open = document.querySelector<HTMLButtonElement>('#open-about');
  const intro = document.querySelector<HTMLElement>('#about-intro');
  const body = document.querySelector<HTMLElement>('#storage-body');
  const ask = document.querySelector<HTMLButtonElement>('#storage-ask');
  const notes = document.querySelector<HTMLElement>('#patch-notes');
  const version = document.querySelector<HTMLElement>('#version');
  if (!dialog || !open || !intro || !body || !ask || !notes || !version) return;

  version.textContent = `${CURRENT.triplet}${CURRENT.name ? ` "${CURRENT.name}"` : ''}`;

  // --- patch notes ---------------------------------------------------------
  notes.replaceChildren(...RELEASES.flatMap((r) => {
    const h = el('h3', 'note-head');
    h.append(el('span', 'note-triplet', r.triplet));
    if (r.name) h.append(el('span', 'note-name', `"${r.name}"`));
    h.append(el('span', 'note-kind', r.kind.toLowerCase()));
    const ul = el('ul', 'note-list');
    ul.append(...r.notes.map((n) => el('li', undefined, n)));
    return [h, ul];
  }));

  // --- storage -------------------------------------------------------------
  const paintStorage = async (): Promise<void> => {
    const r = await read();
    const first = await session.store.getKv<string>(FIRST_GRANT);
    if (r.persisted && !first) await session.store.setKv(FIRST_GRANT, new Date().toISOString());

    const rows: [string, string][] = [
      ['Keeping your data', r.persisted ? 'yes' : r.supported ? 'not yet' : 'cannot tell'],
      ['Asked for', first ? new Date(first).toLocaleString() : r.persisted ? 'just now' : '—'],
      ['Room available', r.quotaMb == null ? 'unknown' : `${r.quotaMb.toLocaleString()} MB`],
      ['Used by Quietkeep', r.usageMb == null ? 'unknown' : `${r.usageMb} MB`],
      ['Things held', String(session.state().nodes.size)],
    ];
    body.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', undefined, k), el('dd', undefined, v)]));

    ask.hidden = r.persisted || !r.supported;

    // Say what is true, including when it is not the comfortable answer (§5).
    const note = el('p', 'storage-note', r.persisted
      ? 'The browser has agreed to keep your data. Worth checking here again in a few days — if this ever says otherwise, export a copy.'
      : r.supported
        ? 'Your writing is saved on this device, but the browser has not promised to keep it and may clear it if the device runs short of space.'
        : 'This browser will not say whether it keeps your data. Export a copy from time to time.');
    body.append(note);
  };

  ask.addEventListener('click', async () => {
    ask.disabled = true;
    try {
      // The notification prompt is part of this on iPadOS — asked for here, in
      // response to a deliberate tap, never on arrival. V-00 confirmed this path
      // works; it did NOT test whether notifications are strictly required, so
      // nothing in the copy claims they are.
      if ('Notification' in globalThis && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      await requestPersistence();
      await paintStorage();
    } finally {
      ask.disabled = false;
    }
  });

  document.querySelector('#about-close')?.addEventListener('click', () => dialog.close());

  // Open immediately, fill after — a button that stalls while it awaits storage
  // is exactly the kind of gap this app exists to be free of.
  const show = (firstRun: boolean): void => {
    intro.hidden = !firstRun;
    dialog.showModal();
    void paintStorage();
  };

  open.addEventListener('click', () => show(false));

  // --- first run -----------------------------------------------------------
  const seen = await session.store.getKv<boolean>(SEEN);
  if (!seen) {
    await session.store.setKv(SEEN, true);
    show(true);
  }
}
