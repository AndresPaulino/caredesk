# 11: Assistant: full tool set, source chips, saved threads, and AI audit

**What to build:** The assistant can answer questions about every record type and about the audit trail itself: "who updated his medications yesterday", "what changed in her medications since she came back", "which residents on Unit B have an allergy conflict". Every answer carries source chips linking to the records used. Threads are saved and can be resumed. Every question and every tool call is written to the audit trail as an assistant access event.

**Blocked by:** 06 (Audit trail: triggers, actor resolution, and the audit tab), 10 (Assistant: drawer, streaming, and the core tools)

**Status:** ready-for-agent

- [ ] Additional tools, all scoped through the caller's session: get lab results, get incidents, get progress notes, get appointments, get family contacts, get a resident's audit trail, get recent activity for a unit or facility, and check allergy-to-medication conflicts for a resident or a unit
- [ ] Source chips are built from the records the tools returned and link to the resident page and the relevant tab
- [ ] Threads and messages persist per staff member with policies allowing only the owner to read them; the drawer lists past threads and resumes one
- [ ] Each question and each tool call is recorded as an audit event attributed to the asking staff member, and those events appear in the activity feed and in the resident's audit trail tab when they concern a resident
- [ ] The assistant remains read-only; no tool has side effects beyond the audit record
- [ ] Integration tests cover every new tool as the nurse and the admin, including the allergy conflict check finding the hero resident with the conflict and the audit trail tool returning the simulator's or a user's recent change
- [ ] A manual check confirms the three questions above produce correct, sourced answers for the hero residents
