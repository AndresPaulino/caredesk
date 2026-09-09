# CareDesk: natural-language access to live resident records

**Status:** ready-for-agent
**Tracker:** local markdown (see `docs/agents/issue-tracker.md`). Tickets live in `issues/` beside this file.
**Vocabulary:** use the terms in the repo's `CONTEXT.md`. Decisions with lasting consequences are recorded as ADRs 0001 to 0003.

## Problem Statement

A software agency wants a credible, real-world showcase for its site: not a to-do app, but something that looks and behaves like software a real organization would pay for. Elder care is a good setting because the data is rich, the privacy stakes are obvious, and the daily work of nurses produces a constant stream of updates.

Nurses and administrators in a care home spend a lot of their day answering questions that the records already contain: when a resident last saw a physician, whether a new medication conflicts with an allergy, who updated a chart yesterday, which residents are overdue for an assessment. Finding those answers means clicking through several screens, and the person asking often isn't at a workstation. The records are also sensitive, so any shortcut that makes them easier to reach must not make them easier to leak.

The showcase has to demonstrate three things at once: a polished operations dashboard, a natural-language assistant that answers questions from those records, and a privacy model in which the assistant can never see more than the person asking is allowed to see. It also has to look alive: other staff are making changes while you watch.

## Solution

CareDesk is a web dashboard for a fictional elder-care operator, Willowbrook Care, which runs six facilities with about 900 current residents and a hundred former residents. Staff log in as a nurse, scoped to one facility and its units, or as an admin with operator-wide visibility.

The dashboard shows census and occupancy, medications due and overdue, overdue assessments, out-of-range vitals, recent incidents, upcoming appointments, and a live activity feed. Residents are searchable and each has a detail page with a clinical timeline, record tabs for conditions, medication orders and administrations, vitals, allergies, lab results, care plan, incidents, progress notes, appointments, and family contacts, and an audit trail tab showing every change with before-and-after values. Nurses can add and edit the records they would touch in a shift.

An assistant is available in a drawer on every page. Staff ask questions in plain language. The assistant answers by calling a bounded set of typed tools that run with the asking user's permissions, streams its answer, shows the records it relied on as source chips, and asks for clarification when a name is ambiguous. Every question and every tool call is written to the audit trail. It is read-only.

A simulator makes ten simulated staff members write realistic changes on a shift rhythm while the demo runs, so the feed moves, the audit trail grows, and the assistant's answers change over time.

All data is generated: a deterministic seed built from a clinical vocabulary derived from Synthea, plus ten hand-authored hero residents whose stories the demo script relies on. A permanent banner states that the data is synthetic and the product is a demonstration.

The deliverable is a public repository with a README that explains the architecture, a screenshots directory, and a demo script for recording. A gated demo for prospects can follow by creating accounts.

## User Stories

### Signing in and scope

1. As a nurse, I want to sign in with an email and password, so that the records I see are tied to who I am.
2. As a visitor evaluating the demo, I want the demo credentials shown on the login page, so that I can get in without asking anyone.
3. As a nurse, I want to see only residents on the units I'm assigned to, so that I'm not exposed to records I have no reason to see.
4. As an admin, I want to see every resident across all six facilities, so that I can run the operator, not just one unit.
5. As a nurse, I want a resident outside my scope to be absent from search, lists, and the assistant's answers, not merely blocked on click, so that the boundary is real.
6. As a nurse, I want to sign out, so that the next person at the workstation starts fresh.
7. As an operator, I want scope enforced in the database rather than in screens, so that every way of reading data, including the assistant, obeys the same rule.

### Dashboard

8. As an admin, I want to see current census and occupancy per facility, so that I know where beds are.
9. As a nurse, I want to see the same tiles scoped to my units, so that the dashboard is about my shift.
10. As a nurse, I want to see medications due this shift and any overdue administrations, so that nothing is missed.
11. As a nurse, I want to see residents with an overdue assessment of any kind, so that I can schedule them.
12. As a nurse, I want to see residents whose latest vitals are out of range in the last 24 hours, so that I can check on them first.
13. As an admin, I want to see incidents in the last seven days across the operator, so that I can spot a facility with a problem.
14. As a nurse, I want to see appointments today and tomorrow, so that transport and preparation happen on time.
15. As a nurse, I want each tile to open a filtered resident list, so that the number becomes a set of people I can act on.
16. As an admin, I want a live activity feed of what staff are changing right now, so that I can see the organization working.
17. As a nurse, I want the activity feed limited to my units, so that it's relevant to me.
18. As a viewer, I want the feed to update without refreshing the page, so that the system feels alive.

### Residents

19. As a nurse, I want to search residents by name, room, and unit, so that I find the right person quickly.
20. As a nurse, I want to filter the resident list by unit, status, and facility, so that I can work a subset.
21. As a nurse, I want a resident's page to lead with demographics, room, status, code status, diet, and mobility, so that the essentials are visible at a glance.
22. As a nurse, I want a clinical timeline that merges assessments, lab results, incidents, and progress notes in date order, so that I can read the resident's recent story top to bottom.
23. As a nurse, I want tabs for conditions, medication orders and administrations, vitals, allergies, lab results, care plan, incidents, progress notes, appointments, and family contacts, so that each record type has a home.
24. As a nurse, I want to see when each assessment kind was last done and when it is next due, so that "last exam" is never a guess.
25. As an admin, I want former residents to remain searchable with their records intact, so that history is preserved after discharge or death.
26. As a nurse, I want an allergy that conflicts with an active medication order to be flagged on the resident's page, so that the conflict is obvious before harm.

### Recording care

27. As a nurse, I want to edit a resident's demographics, room, status, diet, mobility, and code status, so that the record reflects reality.
28. As a nurse, I want to record a set of vitals, so that trends build up.
29. As a nurse, I want to add a medication order and discontinue one, so that the medication list stays current.
30. As a nurse, I want to mark a medication as given with one click, so that the administration record is accurate without slowing me down.
31. As a nurse, I want to write a progress note, so that the next shift knows what happened.
32. As a nurse, I want to report an incident with its kind, time, and description, so that falls and errors are tracked.
33. As a nurse, I want to schedule and cancel appointments, so that outside visits are planned.
34. As a nurse, I want to add and edit family contacts, so that the right person is called.
35. As a nurse, I want to add an allergy, so that new information is captured immediately.
36. As a nurse, I want removed records to be archived rather than destroyed, so that the audit trail stays complete.
37. As a nurse, I want forms to validate input and explain mistakes clearly, so that bad data doesn't reach the record.

### History and audit

38. As an admin, I want every change to any tracked record captured as an audit event with the actor, time, and before-and-after values, so that nothing changes silently.
39. As a nurse, I want an audit trail tab on each resident that reads like a story of who did what, so that I can answer "who changed this".
40. As an admin, I want changes made by the simulator and by real users to look the same in the audit trail, so that the demo is honest about what the system captures.
41. As an admin, I want every assistant question and each tool it called recorded in the audit trail, so that AI use is as accountable as any other access.

### Assistant

42. As a nurse, I want to open the assistant from any page, so that I don't lose my place.
43. As a nurse, I want to ask "when was Mr. Doe's last podiatry exam" and get a dated answer, so that I don't have to dig.
44. As a nurse, I want the assistant to know which resident's page I'm on, so that "his last exam" resolves without naming him.
45. As a nurse, I want to ask about medications, allergies, vitals, lab results, incidents, notes, appointments, and family contacts in plain language, so that any record is a question away.
46. As a nurse, I want to ask who updated a resident's record and when, so that the audit trail is also a question away.
47. As an admin, I want to ask questions across facilities such as "which residents on Unit B have an allergy conflict", so that I can find problems without a report.
48. As a nurse, I want to be asked "which Mr. Doe" when a name matches more than one resident in my scope, so that I never get the wrong person's data.
49. As a nurse, I want the assistant to tell me plainly when it can't find a resident, so that a resident outside my scope looks the same as one who doesn't exist.
50. As a nurse, I want answers to stream in with a visible note of what the assistant is looking up, so that waiting feels purposeful.
51. As a nurse, I want each answer to show source chips linking to the records used, so that I can verify before I act.
52. As a nurse, I want the assistant to refuse to change anything, so that a mistyped question can't alter a record.
53. As a nurse, I want my past threads saved, so that I can return to an earlier question.
54. As a new user, I want suggested prompts on an empty thread, so that I know what to ask.
55. As a nurse, I want the assistant to answer only from the records, never from general medical knowledge presented as fact about a resident, so that it doesn't invent history.
56. As a nurse, I want a clear message if the assistant is unavailable or declines, so that a failure is never a blank screen.

### Liveness

57. As a presenter, I want to start a simulator that makes simulated staff record vitals, give medications, write notes, log incidents, and update residents, so that the demo has movement.
58. As a presenter, I want the simulator to follow a shift rhythm, so that the feed has a plausible daily shape rather than uniform noise.
59. As a presenter, I want to control the simulator's pace, so that I can speed it up for a recording.
60. As a presenter, I want simulated changes attributed to named simulated staff, so that the feed reads like a real organization.
61. As a presenter, I want the simulator to respect clinical plausibility, so that it never gives a discontinued medication or records vitals for a former resident.

### Data and reset

62. As a developer, I want a single command that resets the database and rebuilds the seed, so that I can return to a known state before recording.
63. As a developer, I want the seed to be deterministic, so that the demo script's residents, rooms, and dates never drift between rebuilds.
64. As a developer, I want the seed sized to about 55,000 rows across 1,000 residents, so that it's large enough to be convincing and small enough to rebuild in under a minute.
65. As a developer, I want the clinical vocabulary to come from committed catalogs derived from Synthea, so that names, codes, and condition-to-medication pairings are credible without running Synthea.
66. As a presenter, I want ten hero residents with coherent, interesting stories, so that the demo script always has something to show.
67. As a presenter, I want two residents surnamed Doe in different facilities, so that the ambiguity flow and the scope contrast can both be demonstrated with the same question.

### Showcase

68. As a prospect reading the repository, I want a README that explains the architecture, the privacy model, and how to run it, so that I can judge the agency's work.
69. As a prospect, I want screenshots in the repository, so that I can see the product without running it.
70. As the agency owner, I want a demo script listing the questions to ask on camera and what each demonstrates, so that recording takes one take.
71. As the agency owner, I want the code to read well, with tests at the seams that matter, so that the repository itself is part of the pitch.
72. As the agency owner, I want a persistent banner stating the data is synthetic, so that nobody mistakes the demo for a medical product.

## Implementation Decisions

### Product shape

- One operator, Willowbrook Care, with six facilities of roughly 150 residents each, about four units per facility, and about 120 rooms per facility. Roughly 900 current residents and 100 former residents.
- Two login roles: nurse and admin. Physicians are staff records referenced by assessments and medication orders, never login accounts.
- Three seeded logins: a nurse at one facility, a nurse at a different facility, and an operator-wide admin. The login page shows them.
- US conventions throughout: Fahrenheit, mg/dL, month-day-year.
- A persistent synthetic-data banner on every page.

### Stack

- Next.js with the App Router, TypeScript in strict mode, Tailwind, shadcn components, zod for validation, pnpm.
- Hosted Supabase project providing Postgres, Auth, Row Level Security, and Realtime. Schema changes are versioned migrations in the repo so the project can be recreated from scratch.
- The app runs locally against the hosted project for the case study. It must be deployable to Vercel by setting environment variables, but deployment is not part of this spec.
- Environment configuration is validated at startup and fails fast with a clear message naming the missing variable.

### Data model

Sixteen tables plus assistant threads and messages, all in one Postgres schema:

- Organization: facilities, units, rooms, staff. Staff carry a role (nurse, admin, physician), a facility, and for nurses one or more unit assignments. Staff who can log in are linked to an auth user.
- Residents: demographics, facility, unit, room, admission date, status (current or former, with the reason a stay ended), code status, diet, mobility. Former residents keep everything.
- Clinical: conditions, allergies, medication orders, administrations, vitals, assessments, lab results, care plans with goals, incidents, progress notes, appointments, family contacts.
- Assessments carry a kind (physician visit, nursing assessment, wound check, podiatry, dental, vision, fall-risk, lab draw), a date, the attending staff, and findings. Each kind has a due interval so "overdue" is computable.
- Audit events: one row per change to a tracked table, holding the actor, the table and row, the operation, and before-and-after values.
- Assistant threads and messages belong to the staff member who created them.
- Deletes are soft everywhere: an archived status or timestamp, never a row removal.

Target row budget (approximate): residents 1,000; conditions 4,000; allergies 1,200; medication orders 6,000; administrations 10,000; vitals 12,000; assessments 8,000; lab results 4,000; care plans and goals 2,500; incidents 800; progress notes 5,000; appointments 1,500; family contacts 1,800; organization tables about 600. Around 55,000 rows plus a growing audit trail.

### Scope and authorization

- Row Level Security on every table that holds resident data. A nurse's policy allows rows whose resident is on one of the nurse's units. An admin's policy allows everything. Child tables resolve scope through their resident.
- Audit events are visible within the same scope as the record they describe. Threads and messages are visible only to their owner.
- Application code reads and writes on behalf of a user with that user's session, never the service role (ADR 0003).
- The service role is used only by the seeder and the simulator, and both set an explicit actor so the audit trail names a staff member, not a system account.

### Audit trail

- Captured by database triggers on every tracked table, so UI edits, simulator writes, and any future path are recorded identically.
- The actor is resolved from the authenticated user when present, otherwise from a session setting the simulator provides.
- The activity feed is a Realtime subscription to new audit events, filtered by the subscriber's scope through the same policies.

### Assistant

- Model: Claude Sonnet 5 through the official Anthropic TypeScript SDK, using the SDK's tool runner with zod-typed tool definitions. Adaptive thinking at medium effort. Responses stream to the browser. The model name is a single configuration value.
- The assistant is read-only. Its tools are the only way it touches data (ADR 0001). Initial tool set, all scoped through the caller's session: find residents by name or room, get a resident summary, get assessments and the latest of a kind, get medication orders and administrations, get vitals, get allergies, get lab results, get incidents, get progress notes, get appointments, get family contacts, get the audit trail for a resident, get recent activity for a unit or facility, and check allergy-to-medication conflicts.
- Tool results are the model's only knowledge of residents. The system prompt instructs it to answer from tool results only, to say when it cannot find a resident, and to ask which resident when a search returns more than one plausible match.
- The drawer passes the current resident (when on a resident page) as context so pronouns resolve.
- Every answer carries source chips built from the records the tools returned; chips link to the resident page and tab.
- Threads and messages persist. Each question and each tool call is also written to the audit trail as an assistant access event.
- A refusal or an API failure renders as a clear message in the thread, never an empty response.
- Four suggested prompts on an empty thread, chosen to hit the hero residents.

### Seed and vocabulary

- A deterministic generator driven by a fixed seed builds the whole dataset from the committed clinical vocabulary catalogs (ADR 0002): realistic names, age distribution centered in the mid-eighties, conditions with matching medication orders, allergies with reactions, vitals and lab values drawn from the catalog's percentile ranges, assessments with plausible due dates, and coherent recent history.
- Ten hero residents are hand-authored and layered on top of the generated population. Among them: two residents surnamed Doe in different facilities, one with an overdue podiatry assessment; a resident with a new medication order that conflicts with a documented allergy; a resident with two falls in thirty days and an overdue fall-risk assessment; a resident recently readmitted from hospital with changed medication orders; and a resident with dementia and a frequently calling daughter. The remaining five are lighter variations.
- One command resets and reseeds the database. The seed is identical on every run.

### Simulator

- A standalone command-line process in TypeScript that shares the domain and generator modules with the seeder.
- Ten simulated staff across the six facilities. Actions: record vitals, mark medications given, write progress notes, report incidents, update resident details, schedule appointments. Each action checks plausibility against current data.
- A shift rhythm weights actions by time of day. A pace option scales the interval, defaulting to one action every 30 to 90 seconds.
- Writes go through the service role with the simulated staff member set as actor, so audit events and the feed show a named nurse.

### Showcase artifacts

- README with an architecture section and diagram, the privacy model, setup steps, and credit to Synthea.
- A screenshots directory.
- A demo script listing the on-camera sequence: login as nurse, dashboard, a resident, the assistant questions in order, the scope contrast as admin, the audit trail.

## Testing Decisions

A good test exercises behavior a user or an operator would notice, through the highest seam that gives a deterministic result, and never asserts on implementation details such as component structure or query shape.

Seams, from highest to lowest, and what runs at each:

- **Browser**: one Playwright smoke test. Log in as the nurse, open a hero resident, ask the assistant a fixed question, and assert that an answer with at least one source chip appears. This is the only test that calls the model.
- **Assistant tools**: the primary seam. Each tool is a function over a scoped database client. Integration tests run every tool as the nurse and as the admin against the seeded database and assert on scope (the nurse cannot find the other facility's Doe), correctness (the latest podiatry assessment for a hero resident is the expected date), and shape (source references are present). The model is not involved.
- **Policies**: the proof behind the privacy claim. For each table holding resident data, a test reads as each seeded user and asserts the expected row counts, and a test attempts a write outside scope and asserts it is rejected.
- **Audit triggers**: a change through a user session and a change through the simulator's path both produce an audit event with the right actor and before-and-after values.
- **Seed generator**: pure unit tests. The same seed produces identical output, row counts land within the budget, every medication order references a catalog entry, every hero resident is present with their authored facts, and no former resident has activity after their stay ended.
- **Simulator**: unit tests on action selection and plausibility rules with a fake clock and an in-memory store; no live loop in tests.

Integration tests that need the database run against the hosted Supabase project using the seeded accounts and are skipped when the connection variables are absent, so the unit suite always runs in CI. Lint, typecheck, and the unit suite run on every push in GitHub Actions.

Prior art: none in this repo, which is empty. The conventions above are the prior art for everything that follows.

## Out of Scope

- Assistant write actions of any kind, including with confirmation. The tool layer is designed so they can be added later.
- PHI minimization in prompts and break-the-glass access. Listed in the README as production additions.
- Public, unauthenticated demo hardening: rate limiting, abuse protection, scheduled data resets.
- Deployment to Vercel or anywhere else, and the gated demo itself. The app must remain deployable by environment variables alone.
- Multi-tenancy. There is one operator.
- Physician login, scheduling of staff, billing, insurance, and anything financial.
- Importing Synthea patients, FHIR, or any real clinical data format.
- Real regulatory compliance. The banner says so.
- Mobile apps. The web UI should be usable on a phone but is not optimized for it.
- The case-study write-up for the agency site. The README is its raw material.

## Further Notes

- Human prerequisites before the first ticket can finish: create a hosted Supabase project and provide its URL, anon key, service role key, and database connection string; create a Claude Console account with a personal API key. Both go in a local environment file that is never committed. About ten minutes in total.
- The human time budget is fifteen hours across the whole build: decisions, account setup, reviewing each ticket's result, and recording. Tickets are sized so that each can be picked up in a fresh session and reviewed in minutes.
- Model cost at demo volume is a few cents per question on Sonnet 5.
- The clinical vocabulary was extracted from a Synthea run during the planning session; the raw Synthea output was discarded. The extraction script is kept in the repo so the catalogs can be regenerated.
- ADRs: 0001 typed tools over text-to-SQL, 0002 Synthea as vocabulary source, 0003 scope by Row Level Security.
