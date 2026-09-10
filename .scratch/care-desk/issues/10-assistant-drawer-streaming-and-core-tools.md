# 10: Assistant: drawer, streaming, and the core tools

**What to build:** From any page a nurse opens the assistant drawer and asks "when was Mr. Doe's last podiatry exam". The assistant looks up the resident with tools that run under the nurse's own permissions, streams a dated answer, and shows what it is looking up while it works. The admin asking the same question is asked which Mr. Doe. A nurse asking about a resident outside their scope is told the resident can't be found. The assistant runs on Claude Sonnet 5 and never writes.

**UI approach (ADR 0004):** the drawer is `@shadcn/sheet` anchored right with a persistent trigger in the sidebar shell; the message list, the tool status line, suggested prompts, and source chips are custom components.

**Blocked by:** 04 (Resident detail with clinical timeline and record tabs), 09 (Hero residents)

**Status:** ready-for-agent

- [ ] A server route calls Claude Sonnet 5 through the official Anthropic TypeScript SDK's tool runner with zod-typed tools, adaptive thinking at medium effort, and streaming; the model name is one configuration value
- [ ] Core tools, each executed with the caller's session so scope is inherited (ADR 0001, ADR 0003): find residents by name or room, get a resident summary, get assessments with the latest of a given kind, get medication orders with administrations, get vitals, get allergies
- [ ] The system prompt restricts answers to tool results, instructs the assistant to say when it cannot find a resident, to ask which resident when a search returns more than one plausible match, and to decline anything that is not a question about the records
- [ ] A drawer is available on every page, receives the current resident as context when opened on a resident page so pronouns resolve, streams the answer, and shows a status line naming each tool as it runs
- [ ] An empty thread shows four suggested prompts aimed at the hero residents
- [ ] A refusal stop reason or an API failure renders as a clear message in the thread
- [ ] Integration tests run every core tool as the nurse and the admin against the seeded database and assert scope (the nurse cannot find the other facility's Doe), correctness (the latest podiatry assessment date for the hero Doe), and that results carry the identifiers needed for source chips
- [ ] A manual check confirms the three demo moments: the nurse gets a dated answer, the admin is asked which Doe, the nurse asking about the other Doe is told the resident can't be found
