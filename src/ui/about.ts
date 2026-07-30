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

import { requestPersistence, ulid } from '../ids.ts';
import { toCalendar, calendarCount } from '../ics.ts';
import { exportAll, exportFilename, inspectExport, importSeedingFresh, foldInShard } from '../portability.ts';
import { statusReport, renderReport, periodWords, reportedBefore, type ReportFormat } from '../delta.ts';
import { commsNode } from '../comms.ts';
import { printText } from './print.ts';
import { startCommsSweepEvents, stopCommsSweepEvents } from './focus-intents.ts';
import { fold } from '../fold.ts';
import { highWaterMark } from '../snapshot.ts';
import { heldNodes } from '../gate.ts';
import type { ExportFile } from '../portability.ts';
import type { AppEvent } from '../events.ts';
import { RELEASES, CURRENT } from './changelog.ts';
import type { Session } from './session.ts';
import { sampleEvents, sampleSummary, sampleWords } from '../sample.ts';
import { CONFIRM_WORD, clearEvents, confirmMatches, purgeCount, purgeSummary, purgeWords, purgedWords, type PurgeCount, type PurgeMode } from '../purge.ts';

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
  const exp = document.querySelector<HTMLButtonElement>('#export');
  const noteOut = document.querySelector<HTMLElement>('#storage-note');
  const notes = document.querySelector<HTMLElement>('#patch-notes');
  const version = document.querySelector<HTMLElement>('#version');
  if (!dialog) return;

  // THE WAY OUT IS WIRED FIRST, before anything that can fail.
  //
  // It used to be attached ~490 lines below, after the patch notes, storage,
  // import, comms and report wiring — so every one of those had to succeed for
  // the modal to be closeable, and `app.ts` swallows a throw from this function
  // silently. A dialog you cannot leave is the worst failure this panel has
  // available to it, and it was the last thing to be made possible.
  //
  // Both controls, and `cancel` so a keyboard Esc is never the only route.
  const shut = (): void => { try { dialog.close(); } catch { dialog.removeAttribute('open'); } };
  document.querySelector('#about-dismiss')?.addEventListener('click', shut);
  document.querySelector('#about-close')?.addEventListener('click', shut);
  // `e.target === dialog` IS LOAD-BEARING. `<input type="file">` fires its own
  // `cancel` event when the file chooser is dismissed, and that event BUBBLES —
  // so an unguarded listener here caught the file picker's cancel and shut the
  // whole panel the moment anybody chose a file to import. Found by the smoke
  // walk within minutes of being written, on the surface people reach for after
  // something has already gone wrong.
  dialog.addEventListener('cancel', (e) => { if (e.target === dialog) shut(); });
  // A programmatic showModal has no opener to hand focus back to, so the return
  // is explicit — and it goes to capture, because that is what this app is for.
  dialog.addEventListener('close', () => {
    document.querySelector<HTMLInputElement>('#capture')?.focus();
  });

  if (!open || !intro || !body || !ask || !exp || !notes || !version || !noteOut) return;

  version.textContent = CURRENT.triplet;

  // --- patch notes ---------------------------------------------------------
  //
  // The CURRENT release is shown; everything before it is folded away behind one
  // control. Rendering the lot made this panel **seventeen to twenty-five
  // thousand pixels tall** — measured, not estimated — which is the reason a way
  // out was ever far from a thumb in the first place. Fixing the header's
  // position without fixing that would have left the panel just as unusable to
  // read, and history nobody asked for is not a reason to make today's notes
  // hard to reach.
  //
  // Nothing is removed. It is one tap away and it says how many.
  const noteBlock = (r: typeof RELEASES[number]): HTMLElement[] => {
    const h = el('h3', 'note-head');
    h.append(el('span', 'note-triplet', r.triplet));
    h.append(el('span', 'note-kind', r.kind.toLowerCase()));
    const ul = el('ul', 'note-list');
    ul.append(...r.notes.map((n) => el('li', undefined, n)));
    return [h, ul];
  };
  const [latest, ...older] = RELEASES;
  const rendered: HTMLElement[] = latest ? noteBlock(latest) : [];
  if (older.length > 0) {
    const d = document.createElement('details');
    d.className = 'note-older';
    const sum = document.createElement('summary');
    sum.textContent = older.length === 1
      ? 'One earlier release'
      : `${older.length} earlier releases`;
    d.append(sum, ...older.flatMap(noteBlock));
    rendered.push(d);
  }
  notes.replaceChildren(...rendered);

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
      // `heldNodes`, NOT `nodes.size`. The gauge on the main screen says
      // "N held" from `heldNodes`, and this row says "Things held" — the same
      // words about the same store, and they disagreed by however many things
      // had been let go, because `nodes.size` counts the trashed and the merged.
      // One definition, or the app is telling two stories about one number.
      ['Things held', String(heldNodes(session.state()).length)],
    ];
    body.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', undefined, k), el('dd', undefined, v)]));

    ask.hidden = r.persisted || !r.supported;

    // Say what is true, including when it is not the comfortable answer (§5).
    // The note lives OUTSIDE the <dl>: a definition list may only contain
    // dt/dd groups, and the gate's axe pass failed the note as a child of it —
    // the gate's first real catch, ten minutes after existing.
    noteOut.textContent = r.persisted
      ? 'The browser has agreed to keep your data. Worth checking here again in a few days — if this ever says otherwise, export a copy.'
      : r.supported
        ? 'Your writing is saved on this device, but the browser has not promised to keep it and may clear it if the device runs short of space.'
        : 'This browser will not say whether it keeps your data. Export a copy from time to time.';
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

  // --- the calendar (T1) -----------------------------------------------------
  // The tier that actually reminds you. Same deliver-then-record ordering as the
  // export below, for the same reason: a failed hand-off must never leave the log
  // asserting that a copy left.
  const cal = document.querySelector<HTMLButtonElement>('#calendar');
  const calNote = document.querySelector<HTMLElement>('#calendar-note');
  const paintCalendar = (): void => {
    if (!calNote) return;
    try {
      const n = calendarCount(session.state(), new Date().toISOString(), session.zone);
      calNote.textContent = n === 0
        ? 'Nothing has a date yet, so there is nothing to send.'
        : `${n} ${n === 1 ? 'thing has' : 'things have'} a date to send.`;
    } catch {
      calNote.textContent = '';
    }
  };
  paintCalendar();

  cal?.addEventListener('click', async () => {
    if (!cal || !calNote) return;
    // NOT disabled when there is nothing to send. A disabled control is
    // unreachable by keyboard and explains nothing; this one stays available and
    // answers when asked, which is the same courtesy the rest of the app extends.
    const at = new Date().toISOString();
    if (calendarCount(session.state(), at, session.zone) === 0) {
      calNote.textContent = 'Nothing has a date yet. Give something a date first, and it can go to your calendar.';
      cal.focus();
      return;
    }
    cal.disabled = true;
    try {
      const text = toCalendar(session.state(), at, session.zone);
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename('calendar', at, false, 'ics', session.zone);
      document.body.append(a);
      a.click();
      a.remove();
      // Long grace: on iPadOS the share sheet holds the URL open while the user
      // decides where the file goes.
      setTimeout(() => URL.revokeObjectURL(url), 120_000);

      await session.commit((ctx) => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'export.written', node: null,
        payload: { at, scope: 'calendar', encrypted: false },
      } as AppEvent]);
      calNote.textContent = 'Sent. Open the file to add it to your calendar — it will remind you at 9am on the day.';
    } catch (err) {
      calNote.textContent = `That did not send — nothing left your device. (${(err as Error).message})`;
    } finally {
      cal.disabled = false;
      // Disabling the FOCUSED button blurs it, and re-enabling does not bring
      // focus back — so activating this control dropped focus to <body>, outside
      // the dialog. The same defect class was already fixed twice in this app
      // (clarify.ts, work.ts) and came straight back on a new control (audit).
      // NOT paintCalendar() here: it would immediately overwrite the confirmation
      // the user needs to read. Freshness is handled when the panel opens.
    }
  });

  // --- the comms sweep, opt-in ----------------------------------------------
  // OFF until asked for. A planner that arrives having decided you should check
  // your messages twice a day has made a decision about your working life that
  // it was not asked to make.
  const commsNote = document.querySelector<HTMLElement>('#comms-note');
  const paintComms = (): void => {
    const on = commsNode(session.state()) !== null;
    const start = document.querySelector<HTMLButtonElement>('#comms-start');
    const stop = document.querySelector<HTMLButtonElement>('#comms-stop');
    if (start) start.hidden = on;
    if (stop) stop.hidden = !on;
  };
  paintComms();
  document.querySelector<HTMLButtonElement>('#comms-start')?.addEventListener('click', () => {
    void (async () => {
      try {
        await session.commit(ctx => startCommsSweepEvents(ctx, ctx.id()));
        if (commsNote) commsNote.textContent = 'On. You will be offered one pass when you come out of working on something — never in the middle of it.';
      } catch (err) {
        if (commsNote) commsNote.textContent = `That did not work. (${(err as Error).message})`;
      }
      paintComms();
    })();
  });
  document.querySelector<HTMLButtonElement>('#comms-stop')?.addEventListener('click', () => {
    const n = commsNode(session.state());
    if (!n) return;
    void (async () => {
      try {
        await session.commit(ctx => stopCommsSweepEvents(ctx, n.id));
        if (commsNote) commsNote.textContent = 'Stopped. Nothing will offer it again.';
      } catch (err) {
        if (commsNote) commsNote.textContent = `That did not work. (${(err as Error).message})`;
      }
      paintComms();
    })();
  });

  // --- the status report ----------------------------------------------------
  // "What has changed since I last told anyone" is not a change-log this app
  // maintains. It is fold(log up to then) compared with fold(log) — the same
  // arithmetic everything else here is built on, so there is no second source of
  // truth to drift, and a report over an imported history is exactly as correct
  // as one over a history this device wrote.
  const reportNote = document.querySelector<HTMLElement>('#report-note');
  const reportPreview = document.querySelector<HTMLElement>('#report-preview');

  /**
   * Hand it over, THEN record it — the ordering an audit already had to fix on
   * the export path. A `status.report.exported` written before the text reached
   * anywhere would move the mark, and the next report would silently start from
   * a moment nobody was ever told about. That is a whole reporting period lost,
   * with no error and nothing to notice.
   */
  const deliverReport = async (format: ReportFormat): Promise<void> => {
    if (!reportNote) return;
    const nowIso = new Date().toISOString();
    const after = session.state();
    const since = after.lastReportAt;
    const all = await session.store.all();
    // What was already REPORTED, not what is merely older. A shard union brings
    // in another device's history stamped before your last report; a time cut
    // would bury it for ever (audit).
    const before = fold(reportedBefore(all, { at: since, upToSeqByDevice: after.lastReportMark }));
    const r = statusReport(before, after, since, nowIso, session.zone);
    const text = renderReport(r, format, session.zone);

    try {
      if (format === 'clipboard') {
        // The clipboard can be refused — a permission, a browser that only
        // allows it inside a gesture, an iPad in a state that says no. When it
        // is, the text still has to reach the person, so it is shown rather
        // than lost with an apology.
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          if (reportPreview) { reportPreview.textContent = text; reportPreview.hidden = false; }
          reportNote.textContent = 'Your browser would not let me use the clipboard. Here it is instead — select it and copy.';
          return;                       // NOT recorded: it did not leave.
        }
      } else if (format === 'print') {
        // Through the print area, so what comes out is the report and not the
        // dialog it was launched from plus the whole app behind it. The old path
        // called window.print() against the live page with no print stylesheet
        // in the repo at all — the button worked and the output was unusable.
        printText(text, 'Quietkeep — status');
      } else {
        const ext = format === 'csv' ? 'csv' : 'md';
        const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8';
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFilename('status', nowIso, false, ext, session.zone);
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 120_000);
      }

      await session.commit((ctx) => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'status.report.exported', node: null,
        // The watermark this report went out with — read from the state the
        // report was actually built from, so it can never claim to cover
        // something that landed while the file was being written.
        payload: { format, scope: 'all', upToSeqByDevice: highWaterMark(after) },
      } as AppEvent]);
      reportNote.textContent = 'Handed over. The next one starts from this moment.';
    } catch (err) {
      reportNote.textContent = `That did not work — nothing left your device. (${(err as Error).message})`;
    }
  };

  const REPORT_BUTTONS: [string, ReportFormat][] = [
    ['#report-copy', 'clipboard'], ['#report-markdown', 'markdown'],
    ['#report-csv', 'csv'], ['#report-print', 'print'],
  ];
  for (const [sel, format] of REPORT_BUTTONS) {
    document.querySelector<HTMLButtonElement>(sel)?.addEventListener('click', () => {
      void deliverReport(format);
    });
  }

  // --- export ---------------------------------------------------------------
  // The way out, on the surface that talks about durability. DELIVER, then
  // record: the audit found the old order logging export.written before any
  // file existed, so a failed export left the log asserting a copy left when
  // none did — and the failure itself was silent. Now the file is built and
  // handed to the browser first, the event is committed after, and every
  // failure is said out loud (§5). Each file carries every EARLIER export's
  // record; its own lands one export later.
  /** Build the file, hand it over, THEN record it — one definition, used by the
   *  Export button and by the backup offered before an import. The backup path
   *  is the one that matters most: it runs seconds before the store is replaced,
   *  and a second copy of this logic would be a second chance to get that
   *  ordering wrong. */
  const deliverExport = async (scope: string, ext: string): Promise<void> => {
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
    // Long grace: on iPadOS the share sheet holds the URL open while the user
    // decides where the file goes.
    setTimeout(() => URL.revokeObjectURL(url), 120_000);

    await session.commit((ctx) => [{
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind: 'export.written', node: null,
      payload: { at, scope, encrypted: false },
    } as AppEvent]);
  };

  exp.addEventListener('click', async () => {
    exp.disabled = true;
    try {
      await deliverExport('all', 'json');
      noteOut.textContent = 'Exported. The file is on its way to your Files app or downloads.';
    } catch (err) {
      noteOut.textContent = `The export failed — nothing left your device. (${(err as Error).message})`;
    } finally {
      exp.disabled = false;
      void paintStorage().catch(() => {});
    }
  });

  // --- bringing a copy back ------------------------------------------------
  //
  // The app could hand you your whole log and had no way to read one back, so a
  // new device meant starting again and the export button produced a file
  // nothing could consume. For an app with no accounts and no server, that is
  // not a missing feature — it is the "your data is yours" promise with no exit.
  //
  // The flow is CHOOSE, then be TOLD, then CONFIRM. Import replaces everything
  // (law 9: seeds fresh, never merges), so nothing destructive is reachable
  // until the file has been read and described, and a backup of what is about
  // to be replaced is offered first and listed first.
  const importFile = document.querySelector<HTMLInputElement>('#import-file');
  const importNote = document.querySelector<HTMLElement>('#import-note');
  const importActions = document.querySelector<HTMLElement>('#import-actions');
  const importGo = document.querySelector<HTMLButtonElement>('#import-go');
  const importBackup = document.querySelector<HTMLButtonElement>('#import-backup');
  const importUnion = document.querySelector<HTMLButtonElement>('#import-union');
  const importExplainer = document.querySelector<HTMLElement>('#import-explainer');

  if (importFile && importNote && importActions && importGo && importBackup &&
      importUnion && importExplainer) {
    // Held between choosing and confirming. Parsed ONCE: re-reading the file at
    // confirm time would let it change underneath the description the person
    // just agreed to.
    let staged: ExportFile | null = null;

    const resetImport = (): void => {
      staged = null;
      importActions.hidden = true;
      importExplainer.hidden = true;
    };

    // Clearing the input's value on every open means choosing the SAME file
    // twice still fires `change`. Without it the second choice was silent — the
    // surface said nothing at all, which reads as a broken control (audit).
    importFile.addEventListener('click', () => { importFile.value = ''; });

    importFile.addEventListener('change', async () => {
      resetImport();
      const chosen = importFile.files?.[0];
      if (!chosen) { importNote.textContent = ''; return; }
      importNote.textContent = 'Reading it…';
      // EVERYTHING in the try, not just the parse. `inspectExport` sat outside
      // it, so a file that made it throw left this listener rejected and the
      // note reading "Reading it…" for ever — on the one screen people reach for
      // after something has already gone wrong (audit). `inspectExport` is now
      // total as well; this is the second belt, because an async listener that
      // can reject silently is a bad shape whatever it calls.
      let summary;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await chosen.text());
        summary = inspectExport(parsed);
      } catch (err) {
        importNote.textContent =
          `That file could not be read (${(err as Error).message}). Nothing has changed.`;
        return;
      }
      if (summary.refusals.length > 0) {
        // The refusal is the whole message. It already ends by saying nothing
        // was touched, because at this point nothing has been.
        importNote.textContent = `${summary.refusals[0]} Nothing has changed.`;
        return;
      }
      staged = parsed as ExportFile;
      const made = summary.at ? new Date(summary.at).toLocaleString() : 'an unknown time';
      // The SAME definition the file was measured with (`inspectExport` counts
      // `heldNodes`). Counting `nodes.size` here made the two halves of one
      // sentence disagree — "that file holds 8 things … replaces the 9 things on
      // this device", about a file exported from this device moments earlier.
      // A person comparing those numbers before a destructive action deserves
      // them to be the same kind of number (audit, found by the smoke walk).
      const here = heldNodes(session.state()).length;
      // Both numbers, plainly. "412 events" means nothing to a person; "37
      // things" is the number they can check against what they remember.
      importNote.textContent =
        `That file holds ${summary.items} thing${summary.items === 1 ? '' : 's'} ` +
        `(${summary.events} record${summary.events === 1 ? '' : 's'}), saved ${made}. ` +
        `Bringing it in replaces the ${here} thing${here === 1 ? '' : 's'} on this device. ` +
        'Nothing is merged — this is a replacement.';
      importActions.hidden = false;
      importExplainer.hidden = false;
      // Focus the ADDITIVE one. It is the everyday action and it cannot lose
      // anything; the destructive one should never be what a keyboard lands on
      // by default.
      importUnion.focus();
    });

    // MULTI-DEVICE, and opt-in by being a thing you press. Nothing about this
    // runs on its own, nothing phones anywhere, and the app is complete without
    // it — someone using one device never meets it beyond a line of text
    // (ADR-0035, Noah 2026-07-29: "it should be opt-in").
    importUnion.addEventListener('click', async () => {
      if (!staged) return;
      importUnion.disabled = true;
      importGo.disabled = true;
      try {
        const r = await foldInShard(session.store, staged, new Date().toISOString());
        if (r.taken === 0) {
          importNote.textContent =
            'Nothing new in that copy — everything in it was already here. Nothing changed.';
          return;
        }
        // Recorded IN the log, so a store can say where its contents came from.
        const at = new Date().toISOString();
        const seq = await session.store.nextSeq(session.device);
        await session.store.append([{
          id: ulid(Date.now()), vault: session.vault, at, device: session.device, seq,
          kind: 'shard.folded', node: null,
          payload: { fromDevice: r.fromDevices.join(', ') || 'unknown', taken: r.taken, skipped: r.skipped, at },
        } as AppEvent]);
        importNote.textContent =
          `Took in ${r.taken} record${r.taken === 1 ? '' : 's'} from your other device. ` +
          'Nothing here was removed. Reloading…';
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        importNote.textContent =
          `That copy could not be taken in — ${(err as Error).message} Choose the file again to retry.`;
        resetImport();
        importFile.value = '';
      } finally {
        importUnion.disabled = false;
        importGo.disabled = false;
      }
    });

    importBackup.addEventListener('click', async () => {
      // BOTH disabled. "Replace everything" stayed live while the backup this
      // flow calls "offered first" was still being written, so the store could
      // be replaced out from under the copy meant to protect it (audit).
      importBackup.disabled = true;
      importGo.disabled = true;
      importUnion.disabled = true;
      try {
        await deliverExport('all', 'json');
        importNote.textContent =
          'Saved. That copy is on its way to your Files app or downloads — keep it somewhere ' +
          'you can find it before replacing what is here.';
      } catch (err) {
        importNote.textContent = `Could not save a copy — ${(err as Error).message}. Nothing has been replaced.`;
      } finally {
        importBackup.disabled = false;
        importGo.disabled = false;
        importUnion.disabled = false;
      }
    });

    importGo.addEventListener('click', async () => {
      if (!staged) return;
      importGo.disabled = true;
      importBackup.disabled = true;
      try {
        await importSeedingFresh(session.store, staged);
        // Record it IN THE NEW LOG. A store seeded from a file should say so —
        // and it is written after the reset on purpose, so it survives.
        //
        // Appended directly rather than through `session.commit`: the session's
        // folded state is now stale by a whole store, and committing through it
        // would fold this event onto the state of data that no longer exists and
        // write that as a snapshot.
        const at = new Date().toISOString();
        const seq = await session.store.nextSeq(session.device);
        await session.store.append([{
          id: ulid(Date.now()), vault: session.vault, at, device: session.device, seq,
          kind: 'import.seeded', node: null,
          payload: { fromExport: staged.at, at },
        } as AppEvent]);
        importNote.textContent = 'Brought back. Reloading so everything reads from the new copy…';
        // A full reload, deliberately. Every surface holds a projection of the
        // old store; re-rendering them one by one would be a long list of places
        // to get wrong, and the one place this must not be clever is the path
        // people reach for after something has already gone wrong.
        setTimeout(() => location.reload(), 400);
      } catch (err) {
        // The staged file is DROPPED and the actions are withdrawn. Leaving them
        // armed after a failure meant "Replace everything" could be pressed
        // again over a store whose state was no longer the one described
        // (audit). Choosing the file again is one tap, and it re-describes.
        importNote.textContent =
          `That copy could not be brought back — ${(err as Error).message} Choose the file again to retry.`;
        resetImport();
        importFile.value = '';
        importGo.disabled = false;
        importBackup.disabled = false;
      }
    });
  }

  // (The two ways out and the focus return are wired at the TOP of this function,
  // before anything that can throw. See the note there.)

  // Open immediately, fill after — a button that stalls while it awaits storage
  // is exactly the kind of gap this app exists to be free of.
  const show = (firstRun: boolean): void => {
    intro.hidden = !firstRun;
    dialog.showModal();
    void paintStorage();
    // The calendar count is recomputed on every open. It used to be painted once
    // at mount, so reopening the panel showed the PREVIOUS action's outcome —
    // "Sent. Open the file…" — indefinitely, whatever had changed since (audit).
    paintCalendar();
  };

  // --- sample work ---------------------------------------------------------
  //
  // Through `session.commit`, which is the app's own write path: it admits and
  // appends in one queued transaction. Nothing here is privileged, so the sample
  // set cannot demonstrate a state the app would refuse — and a bug in the
  // generator surfaces as a refusal rather than as a corrupt store.
  const sampleButton = document.querySelector<HTMLButtonElement>('#sample');
  const sampleNote = document.querySelector<HTMLElement>('#sample-note');
  if (sampleButton && sampleNote) {
    sampleButton.addEventListener('click', () => {
      void (async () => {
        sampleButton.disabled = true;
        try {
          const at = new Date().toISOString();
          // Generated ONCE and captured, so the number reported is counted from
          // the very events that were committed. Generating a second set to count
          // would be two sources for one fact, which is the shape that has caused
          // more defects here than any other.
          let made: AppEvent[] = [];
          await session.commit(ctx => {
            made = sampleEvents(ctx, at);
            return made;
          });
          sampleNote.textContent = `${sampleWords(sampleSummary(made))} Reloading…`;
          setTimeout(() => location.reload(), 500);
        } catch (err) {
          // Said plainly, and the button comes back. A refusal here means the
          // generator produced something the gate would not take, which is a
          // defect in the sample set and not something the reader did.
          sampleNote.textContent =
            `That could not be added — ${(err as Error).message} Nothing was changed.`;
          sampleButton.disabled = false;
        }
      })();
    });
  }

  // --- clearing things out --------------------------------------------------
  //
  // The guard is a typed word, NOT a held button: hold-to-confirm is a dexterity
  // test and tremor is a supported condition, so a shaking hand would be locked
  // out of its own data. Typing tests intent, which is the thing being checked.
  //
  // The two modes take different words, and **switching mode clears the field** —
  // the UI half of the same protection. Without it, typing the reversible mode's
  // word and then switching would leave a satisfied-looking control in front of
  // the irreversible one.
  const purgeSummaryEl = document.querySelector<HTMLElement>('#purge-summary');
  const purgeConfirm = document.querySelector<HTMLElement>('#purge-confirm');
  const purgeConsequence = document.querySelector<HTMLElement>('#purge-consequence');
  const purgeWordRequired = document.querySelector<HTMLElement>('#purge-word-required');
  const purgeWordInput = document.querySelector<HTMLInputElement>('#purge-word');
  const purgeGo = document.querySelector<HTMLButtonElement>('#purge-go');
  const purgeCancel = document.querySelector<HTMLButtonElement>('#purge-cancel');
  const purgeNote = document.querySelector<HTMLElement>('#purge-note');
  const purgeBackup = document.querySelector<HTMLButtonElement>('#purge-backup');
  const purgeBackupNote = document.querySelector<HTMLElement>('#purge-backup-note');
  const purgePickClear = document.querySelector<HTMLButtonElement>('#purge-pick-clear');
  const purgePickErase = document.querySelector<HTMLButtonElement>('#purge-pick-erase');

  if (purgeSummaryEl && purgeConfirm && purgeConsequence && purgeWordRequired
      && purgeWordInput && purgeGo && purgeCancel && purgeNote && purgeBackup
      && purgeBackupNote && purgePickClear && purgePickErase) {
    let mode: PurgeMode | null = null;
    let savedACopy = false;

    const counted = async (): Promise<PurgeCount> =>
      purgeCount(session.state(), await session.store.all());

    const paintSummary = async (): Promise<void> => {
      purgeSummaryEl.textContent = purgeSummary(await counted());
    };
    await paintSummary();

    const close = (): void => {
      mode = null;
      purgeConfirm.hidden = true;
      // Cleared on every exit, not only on cancel. A word left in the box is an
      // authorisation left lying next to a button.
      purgeWordInput.value = '';
      purgeGo.disabled = true;
    };

    const pick = async (m: PurgeMode): Promise<void> => {
      mode = m;
      purgeWordInput.value = '';
      purgeGo.disabled = true;
      purgeWordRequired.textContent = CONFIRM_WORD[m];
      // Counted and WRITTEN before the block is revealed. Unhiding first left the
      // consequence line visible and empty for as long as the store read took —
      // an empty paragraph above a button, in the one place where the sentence is
      // the entire safeguard. Revealing a surface before it can say anything is a
      // small version of the same mistake as saying it wrongly.
      purgeConsequence.textContent = purgeWords(m, await counted(), savedACopy);
      purgeConfirm.hidden = false;
      purgeWordInput.focus();
    };

    purgePickClear.addEventListener('click', () => { void pick('clear'); });
    purgePickErase.addEventListener('click', () => { void pick('start-again'); });
    purgeCancel.addEventListener('click', () => {
      close();
      purgeNote.textContent = 'Left alone. Nothing changed.';
    });

    purgeWordInput.addEventListener('input', () => {
      purgeGo.disabled = mode === null || !confirmMatches(mode, purgeWordInput.value);
    });

    purgeBackup.addEventListener('click', () => {
      void (async () => {
        purgeBackup.disabled = true;
        try {
          await deliverExport('all', 'json');
          savedACopy = true;
          purgeBackupNote.textContent = 'Copy saved. Check it opened before going further.';
          // The consequence line is live: it states whether a copy exists, and it
          // must say so NOW rather than the next time the mode is picked.
          if (mode) purgeConsequence.textContent = purgeWords(mode, await counted(), savedACopy);
        } catch (err) {
          purgeBackupNote.textContent =
            `That copy could not be saved — ${(err as Error).message} Nothing has been cleared.`;
        } finally {
          purgeBackup.disabled = false;
        }
      })();
    });

    purgeGo.addEventListener('click', () => {
      void (async () => {
        if (!mode || !confirmMatches(mode, purgeWordInput.value)) return;
        const chosen = mode;
        purgeGo.disabled = true;
        try {
          const before = await counted();
          if (chosen === 'clear') {
            // Through the app's own write path, so law 1 is enforced on the way
            // out exactly as on the way in.
            await session.commit(ctx => clearEvents(ctx, session.state()));
          } else {
            // The one operation in this app that destroys data on purpose.
            // `replaceAll` rather than reset-then-append: there is no window in
            // which the old data is gone and nothing has arrived.
            await session.store.replaceAll([]);
          }
          close();
          purgeNote.textContent = `${purgedWords(chosen, before)} Reloading…`;
          setTimeout(() => location.reload(), 500);
        } catch (err) {
          purgeNote.textContent =
            `That did not go through — ${(err as Error).message} Nothing was changed.`;
          purgeGo.disabled = false;
        }
      })();
    });
  }

  open.addEventListener('click', () => show(false));

  // --- first run -----------------------------------------------------------
  // SEEN is written when the introduction is DISMISSED, not when it is shown:
  // for this audience interruption is the expected case (ADR-0008), and a
  // crash on first paint must not burn the one-time introduction unread.
  // The write is AWAITED and its completion flagged on the document, so a
  // reload immediately after closing cannot race the persistence and re-show
  // the intro — a race the audit-fix first introduced, caught in CI.
  const seen = await session.store.getKv<boolean>(SEEN);
  if (!seen) {
    dialog.addEventListener('close', () => {
      void session.store.setKv(SEEN, true).then(() => {
        document.body.dataset.introDismissed = 'true';
      });
    }, { once: true });
    show(true);
  } else {
    document.body.dataset.introDismissed = 'true';
  }
}
