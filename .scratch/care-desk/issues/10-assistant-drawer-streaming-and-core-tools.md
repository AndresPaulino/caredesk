# 10: Assistant: drawer, streaming, and the core tools

**What to build:** From any page a nurse opens the assistant drawer and asks "when was Mr. Doe's last podiatry exam". The assistant looks up the resident with tools that run under the nurse's own permissions, streams a dated answer, and shows what it is looking up while it works. The admin asking the same question is asked which Mr. Doe. A nurse asking about a resident outside their scope is told the resident can't be found. The assistant runs on Claude Sonnet 5 and never writes.

**UI approach (ADR 0004):** the drawer is `@shadcn/sheet` anchored right with a persistent trigger in the sidebar shell; the message list, the tool status line, suggested prompts, and source chips are custom components.

**Blocked by:** 04 (Resident detail with clinical timeline and record tabs), 09 (Hero residents)

**Status:** ready-for-human

- [x] A server route calls Claude Sonnet 5 through the official Anthropic TypeScript SDK's tool runner with zod-typed tools, adaptive thinking at medium effort, and streaming; the model name is one configuration value
- [x] Core tools, each executed with the caller's session so scope is inherited (ADR 0001, ADR 0003): find residents by name or room, get a resident summary, get assessments with the latest of a given kind, get medication orders with administrations, get vitals, get allergies
- [x] The system prompt restricts answers to tool results, instructs the assistant to say when it cannot find a resident, to ask which resident when a search returns more than one plausible match, and to decline anything that is not a question about the records
- [x] A drawer is available on every page, receives the current resident as context when opened on a resident page so pronouns resolve, streams the answer, and shows a status line naming each tool as it runs
- [x] An empty thread shows four suggested prompts aimed at the hero residents
- [x] A refusal stop reason or an API failure renders as a clear message in the thread
- [x] Integration tests run every core tool as the nurse and the admin against the seeded database and assert scope (the nurse cannot find the other facility's Doe), correctness (the latest podiatry assessment date for the hero Doe), and that results carry the identifiers needed for source chips
- [x] A manual check confirms the three demo moments: the nurse gets a dated answer, the admin is asked which Doe, the nurse asking about the other Doe is told the resident can't be found

## Comments

**2026-09-10, agent.** Built and checked on the hosted project.

- Route: `POST /api/assistant` (`src/app/api/assistant/route.ts`) streams newline-delimited JSON events (`src/lib/assistant/protocol.ts`: `context`, `text`, `tool`, `done`, `error`). `src/lib/assistant/run.ts` drives `client.beta.messages.toolRunner` with `stream: true`, `thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }`, `max_iterations: 8`, and the model from `ANTHROPIC_MODEL` (default `claude-sonnet-5`). A `refusal` stop reason and every SDK error class become an `error` event with a sentence for the thread; `max_tokens` and an exhausted iteration budget become a `done` with a note.
- Tools: `src/lib/assistant/tools.ts` holds the six functions over the caller's client (`findResidents`, `getResidentSummary`, `getAssessments`, `getMedicationOrders`, `getVitals`, `getAllergies`); every resident-scoped result carries `source: { residentId, residentName, tab }` and every record its id, for ticket 11's chips. `tool-definitions.ts` wraps them with `betaZodTool` and reports each run to the status line. A resident outside scope is `null` from the function and "not among the residents you can see" to the model.
- Prompt: `src/lib/assistant/prompt.ts`, a cached instructions block plus a per-request block naming the staff member, scope, date, and current resident.
- Drawer: `src/components/assistant/` (`AssistantProvider` in the app layout, `AssistantTrigger` in the sidebar, `AssistantDrawer` as a right sheet, `AssistantCurrentResident` rendered by the resident page, `useAssistantThread`). The thread is in memory and survives closing the drawer and navigating; ticket 11 saves it. Suggested prompts: `src/lib/assistant/suggested-prompts.ts`.
- Tests: `tools.integration.test.ts` (scope, the hero Doe's podiatry date, shape) plus unit tests for the protocol, search terms, prompt, suggested prompts, and the runner (`run.test.ts`: a refusal, an exhausted token or lookup budget, and each SDK error class over a fake client, since the live model never refused or failed). `pnpm check` green.
- Manual check through the route, signed in as each demo account:
  - Meadows nurse, "When was Mr. Doe's last podiatry exam?": searched "Doe" (1 match), read 2 podiatry assessments, answered "May 2, 2026 (131 days ago), performed by Dr. Javier Leal. It's now overdue, the next was due July 31, 2026".
  - Admin, same question: searched "Doe" (2 matches), answered "I found two residents named Doe: Harold Doe (Willowbrook Meadows, Unit A, room 104) and Walter Doe (Willowbrook Harbor, Unit B, room 212). Which one did you mean?"
  - Meadows nurse, "When was Walter Doe's last podiatry exam?": searched, no match, answered "I can't find a resident named Walter Doe in the records available to me."
  - Meadows nurse on Harold's page (current resident), "When was his last podiatry exam, and what is he taking for his diabetes?": no search, read assessments and orders in parallel, answered both with dates.
  - Meadows nurse, "Record vitals for Harold Doe ... what's a normal A1c": declined both, pointed to the resident page.
- Glossary: added Current resident, Status line, and Suggested prompt to `CONTEXT.md`.
- Deviation to note: `find_residents` takes optional `unit` and `facility` filters beyond "name or room", so "Doe at Harbor" narrows without a second search.
