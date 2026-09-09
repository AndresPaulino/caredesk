# 06: Audit trail: triggers, actor resolution, and the audit tab

**What to build:** Every change to a tracked record becomes an audit event naming the actor, the time, and the values before and after, whether the change came from a nurse in the UI or from the simulator's service-role path. The resident page gains an audit trail tab that reads like a story of who did what, with a before-and-after view for each event.

**Blocked by:** 05 (Recording care: create and edit flows)

**Status:** ready-for-agent

- [ ] An audit events table and database triggers cover every tracked table from the spec, capturing operation, row identity, and before-and-after values
- [ ] The actor is resolved from the authenticated user when present, otherwise from a session setting that service-role callers must provide; a write with neither is rejected
- [ ] Audit events are readable within the same scope as the record they describe, via policies
- [ ] The resident page has an audit trail tab listing events newest first with actor, time, record type, and a readable summary, and expands to a field-by-field before-and-after view
- [ ] Trigger tests prove that a change through a user session and a change through the service-role path with an actor setting both produce a correct audit event, and that the archive flows from ticket 05 are captured as changes, not deletes
- [ ] The audit trail tab is included in the resident page's "not found" behavior for out-of-scope residents
