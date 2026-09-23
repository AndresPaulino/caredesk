---
status: accepted
---

# Colour is reserved for action, and resident flags use wristband colours

The first build used shadcn's greyscale theme, so an overdue dose and an up-to-date assessment carried the same visual weight. The redesign (ticket 14) gives the brand a willow green and a cool off-white, and restricts every other colour to two jobs.

Status colour means a nurse has something to do: critical red for overdue, conflicts, and out-of-range values; amber for due today or soon. Things that are fine ("up to date", a zero count) are muted text, not a green badge, so the eye lands only on work.

Resident flags use the US standardized wristband colours (red allergy, yellow fall risk, purple DNR) because care staff already read them without a legend. We considered a single "alert" colour for all flags and a brand-derived palette; both would have to be learned, and the wristband code is the one colour convention this audience shares.

## Consequences

- Green is the brand, so it is never used to mean "good". A reviewer adding a success state uses muted text and a check.
- Every flag and status carries its word or an icon with a label; colour is never the only signal.
- Flags are derived in one place (`src/lib/clinical/flags.ts`) so the list, the resident banner, and any later surface agree.
