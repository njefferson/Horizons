// V-00 — the iPadOS storage check, on the device it is about.
//
// This is the highest-value open verification in the repo and it has been
// blocked since 2026-07-27 for one reason: it needs a real iPad and there was
// nothing to put on one. There is now.
//
// Two claims to settle (docs/verifications.md V-00):
//   1. Does navigator.storage.persist() resolve true after notification
//      permission is granted?
//   2. Does persisted() STILL report true the next morning?
//
// Step 2 is the one that matters, and it is why this panel records the first
// grant with its timestamp instead of only reading the current value. A `true`
// on day one that silently reverts is worse than a `false`, because the app
// would be promising durability it does not have — and on this platform there
// is no folder mirror underneath to catch it (ADR-0003 does not exist on iPadOS).
//
// The panel reports what it measures. It never rounds a `false` up.

import { requestPersistence } from '../ids.ts';
import type { Session } from './session.ts';

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

export function mountDiagnostics(session: Session): void {
  const dialog = document.querySelector<HTMLDialogElement>('#diagnostics');
  const open = document.querySelector<HTMLButtonElement>('#open-diagnostics');
  const body = document.querySelector<HTMLElement>('#diag-body');
  const ask = document.querySelector<HTMLButtonElement>('#diag-ask');
  if (!dialog || !open || !body || !ask) return;

  const paint = async (): Promise<void> => {
    const r = await read();
    const first = await session.store.getKv<string>(FIRST_GRANT);

    if (r.persisted && !first) {
      await session.store.setKv(FIRST_GRANT, new Date().toISOString());
    }

    const rows: [string, string][] = [
      ['Storage API', r.supported ? 'available' : 'not available'],
      ['Persistent right now', r.persisted ? 'yes' : 'no'],
      ['First granted', first ? new Date(first).toLocaleString() : r.persisted ? 'just now' : '—'],
      ['Quota', r.quotaMb == null ? 'unknown' : `${r.quotaMb} MB`],
      ['Used', r.usageMb == null ? 'unknown' : `${r.usageMb} MB`],
      ['Notifications', notificationState()],
      ['Device id', session.device],
      ['Events held', String(session.state().eventCount)],
    ];

    body.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));

    ask.hidden = r.persisted || !r.supported;

    const note = document.createElement('p');
    note.className = 'diag-note';
    note.textContent = first && r.persisted
      ? 'Open this again tomorrow. If "Persistent right now" still says yes, the grant survived a night — that is the answer V-00 needs.'
      : r.persisted
        ? 'Granted. Come back tomorrow and check it still says yes.'
        : 'Not persistent. Your data is still here, but the browser may evict it under storage pressure — so exports are the durability story, not a convenience.';
    body.append(note);
  };

  // Open first, fill after. Reading storage is async, and a button that does
  // nothing for a beat while it awaits is exactly the kind of gap this app is
  // supposed to be free of.
  open.addEventListener('click', () => { dialog.showModal(); void paint(); });
  dialog.addEventListener('close', () => { /* nothing to clean up */ });
  document.querySelector('#diag-close')?.addEventListener('click', () => dialog.close());

  ask.addEventListener('click', async () => {
    ask.disabled = true;
    try {
      // On iOS persistence is reported to require notification permission, which
      // is why this asks for it first (ADR-0007, V-00). If that turns out to be
      // false the request is harmless; if it is true, this is the only way to
      // get a real answer.
      if ('Notification' in globalThis && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      await requestPersistence();
      await paint();
    } finally {
      ask.disabled = false;
    }
  });
}

const notificationState = (): string =>
  'Notification' in globalThis ? Notification.permission : 'not available';
