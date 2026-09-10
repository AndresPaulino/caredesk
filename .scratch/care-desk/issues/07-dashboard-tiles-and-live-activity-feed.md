# 07: Dashboard tiles and the live activity feed

**What to build:** Signing in lands on a dashboard with six tiles and a live activity feed. An admin sees the whole operator; a nurse sees the same tiles scoped to their units. Each tile opens a filtered resident list. The feed shows new audit events as they happen without a page refresh.

**UI approach (ADR 0004):** start from the `@shadcn/dashboard-01` block (sidebar, stat cards, interactive area chart, data table) and cut it down to the six tiles and the feed; census and occupancy by facility uses `@shadcn/chart`; the feed is a custom list.

**Blocked by:** 06 (Audit trail: triggers, actor resolution, and the audit tab)

**Status:** ready-for-agent

- [ ] Tiles: census and occupancy by facility, medications due this shift and overdue administrations, residents with an overdue assessment, residents with out-of-range vitals in the last 24 hours, incidents in the last seven days, and appointments today and tomorrow
- [ ] Each tile's number is computed within the signed-in user's scope, and clicking it opens the resident list pre-filtered to those residents
- [ ] The activity feed subscribes to new audit events through Supabase Realtime, filtered by the subscriber's scope through the same policies, and renders each as "who did what to whom, when" with a link to the resident
- [ ] The feed initially shows the most recent events and prepends new ones live; a change made in a second browser session appears within a few seconds
- [ ] The dashboard works at phone width with tiles stacking
- [ ] Integration tests, run as the nurse and the admin, assert each tile's count against known seed facts, and a test asserts that the feed query for the nurse excludes events from other facilities
