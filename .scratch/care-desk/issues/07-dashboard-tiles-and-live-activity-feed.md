# 07: Dashboard tiles and the live activity feed

**What to build:** Signing in lands on a dashboard with six tiles and a live activity feed. An admin sees the whole operator; a nurse sees the same tiles scoped to their units. Each tile opens a filtered resident list. The feed shows new audit events as they happen without a page refresh.

**UI approach (ADR 0004):** start from the `@shadcn/dashboard-01` block (sidebar, stat cards, interactive area chart, data table) and cut it down to the six tiles and the feed; census and occupancy by facility uses `@shadcn/chart`; the feed is a custom list.

**Blocked by:** 06 (Audit trail: triggers, actor resolution, and the audit tab)

**Status:** ready-for-human (review)

- [x] Tiles: census and occupancy by facility, medications due this shift and overdue administrations, residents with an overdue assessment, residents with out-of-range vitals in the last 24 hours, incidents in the last seven days, and appointments today and tomorrow
- [x] Each tile's number is computed within the signed-in user's scope, and clicking it opens the resident list pre-filtered to those residents
- [x] The activity feed subscribes to new audit events through Supabase Realtime, filtered by the subscriber's scope through the same policies, and renders each as "who did what to whom, when" with a link to the resident
- [x] The feed initially shows the most recent events and prepends new ones live; a change made in a second browser session appears within a few seconds
- [x] The dashboard works at phone width with tiles stacking
- [x] Integration tests, run as the nurse and the admin, assert each tile's count against known seed facts, and a test asserts that the feed query for the nurse excludes events from other facilities

## Comments

**2026-09-10, agent.** Built. Notes for review:

- The rules live in one migration (`20260910210000_dashboard.sql`): `resident_dashboard_at(as_of)` returns the directory with a flag per tile, `dashboard_tiles_at(as_of)` counts it, and the resident list reuses the first with `?focus=<tile>`, so a tile's number and the list behind it are the same query. Thresholds are reference tables (`vital_ranges`, `medication_dose_times`, `shifts`) mirrored in `src/lib/clinical/`, and `src/lib/dashboard/rules.ts` states the rules in TypeScript; the integration test proves the database agrees with them for the nurse and the admin at the seed's anchor.
- Definitions chosen: "due this shift" is an outstanding scheduled dose (no administration within two hours of its time) in the current shift, past or to come; "overdue" is an outstanding dose more than an hour past its time in the last 24 hours; shifts are day 7 to 3, evening 3 to 11, night 11 to 7, Eastern. Out-of-range vitals is any set in the last 24 hours, per the ticket's wording (the spec story says "latest vitals"). Incidents count every incident in the window; the list behind the tile is the residents involved.
- The UI approach line was followed by viewing `@shadcn/dashboard-01` and taking its stat-card markup (`CardDescription` label, `CardTitle` number, `CardAction`, `CardFooter`) rather than adding the block, which would have brought its own sidebar, header, and data table. The census chart is a shadcn `ChartContainer` with a stacked horizontal bar per facility (per unit for a nurse).
- The feed subscribes to `audit_events` inserts as the signed-in user and reads each announced event back through a server action, so the policy applies twice. Fresh from a reseed the feed is empty because the seed writes no events (the ticket 06 deviation, still open for Andres).
- Left for later tickets: "Realtime" needs no dashboard toggle, the table was already in the publication. The nurse's feed gets busy only once the simulator (ticket 08) runs.
