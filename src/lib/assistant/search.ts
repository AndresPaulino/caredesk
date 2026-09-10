/**
 * Turns the way a nurse names a resident ("Mr. Doe", "Harold Doe's", "room 104") into the
 * terms the resident search matches. The resident directory's `search_text` is the resident's
 * first name, last name, and room number, so honorifics, possessives, and the word "room" would
 * only get in the way. Every term must match (they are ANDed), so "Harold Doe" finds Harold Doe
 * and not every other Doe.
 */

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "sir", "madam"]);

const FILLER = new Set(["room", "resident", "the", "in", "of"]);

export function residentSearchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[.,;:!?"()]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 0 && !HONORIFICS.has(term) && !FILLER.has(term));
}
