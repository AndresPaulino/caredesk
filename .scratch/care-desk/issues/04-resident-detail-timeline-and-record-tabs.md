# 04: Resident detail with clinical timeline and record tabs

**What to build:** A resident's page tells their story. It leads with the essentials, shows a clinical timeline that merges assessments, lab results, incidents, and progress notes in date order, and offers a tab for every record type. For each assessment kind the page states when it was last done and when it is next due, and an allergy that conflicts with an active medication order is flagged where a nurse will see it.

**UI approach (ADR 0004):** header as a grid of `@shadcn/card`; record tabs with `@shadcn/tabs` and the data table pattern from ticket 02; vitals and lab trends with `@shadcn/chart`. The clinical timeline and the assessment summary have no block to start from and get the design time.

**Blocked by:** 03 (Clinical schema and the deterministic seed)

**Status:** ready-for-agent

- [ ] The header shows demographics, facility, unit, room, admission date, status, code status, diet, and mobility; former residents show how and when their stay ended
- [ ] The clinical timeline merges assessments, lab results, incidents, and progress notes newest first, each entry labeled by type and attributed to its staff member
- [ ] Tabs exist for conditions, medication orders with their administrations, vitals, allergies, lab results, care plan with goals, incidents, progress notes, appointments, and family contacts
- [ ] An assessment summary lists every assessment kind with last-done and next-due dates and marks overdue kinds
- [ ] An allergy conflicting with an active medication order is flagged on the header and on both relevant tabs
- [ ] Every read goes through the signed-in user's session so the page returns "not found" for an out-of-scope resident
- [ ] The page works at phone width without horizontal scrolling
- [ ] Integration tests, run as the nurse against the seeded database, assert the assessment summary's last-done and overdue logic and the allergy conflict detection on known seed residents
