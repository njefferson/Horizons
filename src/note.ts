// The note field's one cleaner (1.4.0).
//
// Deliberately NOT `cleanTitle`. A title strips every control character because
// a name is one line; a note is prose, and `\n` and `\t` are its structure.
// Format characters (bidi overrides, zero-width) are still removed — they are
// invisible, and a bidi override can make text display as something other than
// what is stored. The cap is generous: this is a note kept with an item, not a
// document store.
//
// Lives here rather than in `src/ui/` because the IMPORTER writes notes too,
// and two cleaners is how the same file imports differently from how it types.
// PURE.

export const NOTE_MAX = 10_000;

export function cleanNote(raw: string): string {
  const stripped = raw
    .replace(/[\p{Cf}]/gu, '')
    .replace(/[\p{Cc}]/gu, c => (c === '\n' || c === '\t' ? c : ''))
    .trim();
  return stripped.length > NOTE_MAX ? stripped.slice(0, NOTE_MAX).trim() : stripped;
}
