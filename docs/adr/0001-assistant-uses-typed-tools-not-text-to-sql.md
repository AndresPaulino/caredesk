---
status: accepted
---

# The assistant answers through typed, scope-enforced tools, not text-to-SQL

The assistant must answer questions over resident records while honoring each staff member's scope. We considered letting the model write SQL against a read-only connection and rejected it: scoping would then live in prompt text instead of the database, failures would be unpredictable on camera, and every generated query would be a new surface to audit. Instead the assistant can only call a bounded set of typed tools, and each tool runs with the caller's own database permissions, so Row Level Security applies to the assistant exactly as it applies to the UI.

## Consequences

- A question the tools cannot express gets an honest "I can't answer that from the records I can see", never an improvised query.
- Extending what the assistant can answer means adding a tool, not loosening the boundary. Do not add a raw SQL escape hatch.
- Write actions, if ever added, are new tools with an explicit confirmation step; the read tools stay side-effect free.
