# 05: Recording care: create and edit flows

**What to build:** A nurse can do the work of a shift from the resident page: edit the resident's details, record vitals, add or discontinue a medication order, mark a medication as given with one click, write a progress note, report an incident, schedule or cancel an appointment, add or edit a family contact, and add an allergy. Removals archive the record instead of destroying it. Every form validates and explains mistakes.

**UI approach (ADR 0004):** forms use `@shadcn/form` with the zod schemas the server validates against; create and edit flows open in `@shadcn/sheet` (or `@shadcn/dialog` for one-field actions such as marking a medication given) from the record tabs, so the resident page stays in place.

**Blocked by:** 04 (Resident detail with clinical timeline and record tabs)

**Status:** ready-for-agent

- [ ] Edit flows exist for resident details (demographics, room, status, code status, diet, mobility) with room changes keeping room occupancy consistent
- [ ] Create flows exist for vitals, medication orders, progress notes, incidents, appointments, family contacts, and allergies; discontinue exists for medication orders; cancel exists for appointments
- [ ] A one-click "mark given" action on an active medication order records an administration attributed to the signed-in nurse with the current time
- [ ] Removing an appointment, contact, or allergy archives it; archived records disappear from default views and remain in the database
- [ ] Assessments, lab results, conditions, and care plans are read-only in the UI
- [ ] All input is validated with zod on the server; errors are shown next to the field that caused them
- [ ] Write policies allow a nurse to write only within scope and an admin everywhere; a test attempts an out-of-scope write as the nurse and asserts rejection
- [ ] The resident page and timeline reflect each change immediately after submit
