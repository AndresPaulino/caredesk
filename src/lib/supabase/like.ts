/** `%` and `_` are wildcards in `ilike`; a typed search term should match them literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
