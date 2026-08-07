// Law 9's pre-migration export, enforced at the only moment it can matter.
//
// ## Why this is a guard and not machinery
//
// `NOTES.md` law 9, `CLAUDE.md`, `docs/data-constitution.md` and ADR-0006 all
// say the same thing: **auto-export a snapshot before any migration.** None of
// them is implemented. The vocabulary is honest about it — `schema.migrated` is
// recorded as unemitted with no migration machinery behind it — but four
// documents state a guarantee the code does not keep, and this repo's own rule
// is that a stated guarantee is enforced in code and asserted by a test, or it
// is not stated.
//
// The tempting fix is to build the machinery now. That would be speculative: no
// data-transforming migration has ever run. `version(1)` and `version(2)` add a
// table and an index and nothing else, which Dexie performs without touching a
// single stored value, and this repo already has a recorded lesson about
// building nouns before anything needs them.
//
// So the guarantee is enforced the other way round: it is made **impossible to
// add a transforming migration without wiring the export**. Dexie transforms
// data in exactly one place — an `.upgrade()` callback on a version — so a
// version that declares one, without the export hook beside it, fails here. On
// the day somebody needs a real migration, this test is what tells them law 9
// is part of the job rather than something to remember.
//
// It passes trivially today, and saying so is the point: it is aimed at a
// future edit, and a guard aimed at nothing must say which edit it is waiting
// for (hub LESSON 66).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const STORE = readFileSync(join(ROOT, 'src', 'dexie-store.ts'), 'utf8');

/** Comments describe upgrades; only code performs them. */
const code = STORE.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

test('law 9: no Dexie version transforms data without a pre-migration export', () => {
  const upgrades = code.match(/\.upgrade\s*\(/g) ?? [];
  if (upgrades.length === 0) {
    // The additive-only state. Assert it is genuinely additive rather than
    // assuming it: every declared version must be a bare `.stores({...})`.
    const versions = code.match(/\.version\(\d+\)/g) ?? [];
    assert.ok(versions.length > 0, 'the store declares no versions at all — this guard is pointed at nothing');
    return;
  }
  // The moment an upgrade exists, the export must exist beside it. Named
  // explicitly so the failure tells the next person what to build rather than
  // that something is missing.
  assert.ok(/preMigrationExport|exportBeforeMigration/.test(code),
    'a Dexie .upgrade() transforms stored data, and law 9 requires a copy to be '
    + 'written and handed over BEFORE it runs — see NOTES.md law 9, ADR-0006 and '
    + 'docs/data-constitution.md. Wire the export, emit snapshot.written '
    + "{reason:'pre-migration'} and schema.migrated, then widen this test.");
});

test('law 9: the migration line claims nothing the app does not do', () => {
  // `log-words.ts` rendered `schema.migrated` as "a copy was exported first" —
  // law 9's promise attached to an event that records something else, behind a
  // kind nothing emits. Unreachable, and still a claim. Doctrine §5.
  const words = readFileSync(join(ROOT, 'src', 'log-words.ts'), 'utf8');
  const line = words.split('\n').find((l) => l.includes("case 'schema.migrated'")) ?? '';
  assert.ok(!/export/i.test(line) && !/copy/i.test(line),
    'the migration line asserts a copy was taken; that belongs to the export’s own event, '
    + 'and attaching it here makes it true by assertion rather than by having happened');
});
