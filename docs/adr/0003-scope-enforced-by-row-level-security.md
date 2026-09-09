---
status: accepted
---

# Scope is enforced by Row Level Security, not by application code

A nurse may only see residents on their assigned units; an admin sees the whole operator. We chose to express that rule once, as Postgres Row Level Security policies keyed off the authenticated user, rather than as filters in application queries. Every read path, including the UI, the assistant's tools, and the Realtime activity feed, therefore inherits the same boundary without remembering to apply it.

## Consequences

- Application code that talks to the database on behalf of a user must use that user's session, never the service role. The service role is reserved for the seeder and the simulator, which set an explicit actor for the audit trail.
- A new table that holds resident data is not done until it has policies; the policy tests are the proof behind the privacy claim in the case study.
- Do not "fix" a missing row by bypassing the policies in a query. If a user should see it, change their scope.
