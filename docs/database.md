# Database and migrations

CareDesk runs against a hosted Supabase project. The schema is versioned as SQL migrations in
`supabase/migrations/`, applied with the Supabase CLI over a direct Postgres connection. Nothing
here needs Docker or a local Supabase stack.

## One-time setup

1. In the Supabase dashboard open **Connect** and choose **Session pooler**.
2. Copy the URI and put it in `.env.local` as `DATABASE_URL`, replacing `[YOUR-PASSWORD]` with
   the database password. Percent-encode special characters in the password (`@` becomes `%40`,
   `#` becomes `%23`, and so on).
3. Run `pnpm db:status`. It should list the local migrations and show which are not yet on the
   remote.

The session pooler works from IPv4 networks; the direct connection on port 5432 of
`db.<ref>.supabase.co` is IPv6 only unless the project has the IPv4 add-on.

## Day to day

| Command              | What it does                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm db:new <name>` | Creates an empty `supabase/migrations/<timestamp>_<name>.sql`                                            |
| `pnpm db:push`       | Applies every migration the remote has not seen, in filename order, and records it in the remote history |
| `pnpm db:status`     | Shows local and remote migration history side by side                                                    |

Migrations are applied once and never edited afterwards. To change something, add a new migration.

The wrapper in `scripts/db/remote.mjs` reads `DATABASE_URL` from `.env.local` and passes it to
the CLI with `--db-url`, so no `supabase login` or `supabase link` is needed. `supabase/config.toml`
exists only because the CLI expects it; its local-development settings are unused.

## Verifying

`pnpm dev`, then open [http://localhost:3000/health](http://localhost:3000/health). The Database
card calls the `health_check` function from the first migration and shows the database's clock.
If the card says the function is missing, migrations have not been pushed yet.

## Seeding

`pnpm db:seed` (`scripts/seed/reset.ts`) connects with `SUPABASE_SECRET_KEY`, creates the three
demo auth users if they are missing, empties every demo table with one call to
`reset_demo_data()`, and inserts the generated dataset in chunks: the organization, about 1,000
residents, and their clinical records, close to 59,000 rows in all. It records the run in
`seed_runs`. It checks each demo password by signing in with the publishable key and resets it
only when that fails, because a reset signs the account out everywhere; a routine reseed leaves
open browser sessions alone.

The generator lives in `src/lib/seed/` and is shared with the tests and the simulator:

- `vocabulary.ts` reads the catalogs under `data/vocabulary/` (ADR 0002) and decides which
  entries a care-home record uses and how often. Synthea's prevalence describes a general
  elderly population, so the care-home prevalence of each condition is set there.
- `organization.ts` builds the six facilities, four units each, thirty rooms per unit (ten
  semi-private), the demo accounts, and two physicians and eight nurses per facility, ten of the
  nurses, spread over every facility, flagged as simulated staff for the simulator.
- `residents.ts` places about 150 current residents per facility (94 percent of beds) plus
  about 100 former residents, with names from the pools, ages centered in the mid-eighties, and
  the conditions that shape the rest of the record.
- `records.ts` writes each resident's conditions, allergies with reactions, medication orders
  paired with the conditions the catalog says they treat (never one the resident is allergic
  to), three days of administrations, vitals, assessments with plausible last-done dates, lab
  results, a care plan with goals, incidents, progress notes, appointments, and family contacts.
  A former resident's activity stops when their stay ended.
- `text.ts` holds the findings, notes, and goal templates so the records read like a chart.

Everything derives from a seed number (default `20260909`) and an **anchor** instant: "now",
rounded down to the hour, unless `--anchor <ISO instant>` pins it. Recent records are placed
relative to the anchor so a fresh reseed always has vitals from this morning, an appointment
tomorrow, and an assessment overdue since last week. Ids derive from stable keys, not from the
anchor, so links keep working from one reseed to the next. The same seed and anchor produce the
same rows; `src/lib/seed/seed.test.ts` proves that, along with the row budget, catalog
references, and the former-resident rule.

## Scope

Scope lives in the database (ADR 0003). The helper functions `current_staff_id()`,
`current_staff_role()`, `is_admin()`, `current_unit_ids()`, and `current_facility_ids()` are
`security definer` so a policy can ask who is signed in without recursing into the staff table's
own policies; each reads only the caller's own rows. Policies call them as `(select ...)` so
Postgres evaluates them once per query.

The app reads residents through the `resident_directory` view, which joins facility, unit, and
room names and carries a `search_text` column for the search box. It is created with
`security_invoker = true`, so the caller's policies on the underlying tables apply and the view
can never widen scope.

Every clinical table carries a `resident_id`, and its policies are one expression: the row's
resident is visible to the caller (`resident_id in (select id from residents)`). The subquery
runs under the residents policies, so an admin matches everyone and a nurse matches their
units, and there is one place to change the rule. Nurses may insert and update rows for
residents they can see; there is no delete policy anywhere, because records are archived.
Composite foreign keys such as `(medication_order_id, resident_id)` keep a child record on the
same resident as its parent.

The tables that name the staff member who did the work (`vitals.taken_by`,
`administrations.administered_by`, `progress_notes.written_by`, `incidents.reported_by`,
`appointments.scheduled_by`) also require, on insert, that it be the caller
(`current_staff_id()`): a nurse records care in their own name, never a colleague's. Medication
orders are the exception, because `prescribed_by` is a physician and the nurse enters the order
on their behalf. The seeder and the simulator use the service role and set the actor themselves.

## Recording care

The write flows on the resident page (ticket 05) go through `src/lib/care/`:

- `schemas.ts` holds one zod schema per form. The browser validates a submission against it
  for instant feedback and the server action validates it again before writing, so a form and
  its action can never disagree about what is valid. Times typed into a form are Eastern
  wall-clock times and become instants there.
- `record.ts` is the seam: one function per write, over the caller's own Supabase client, so
  scope is decided by the policies above and nothing else. An update that matches no visible
  row comes back as "not found", a policy rejection as "forbidden". Removing an appointment,
  contact, or allergy stamps `archived_at`; nothing is deleted.
- `actions.ts` holds the server actions: authenticate, parse, call `record.ts`, then
  `refresh()` so the page shows the change in the same round trip.
- `options.ts` reads what the forms offer to choose from (physicians, units, rooms with
  occupancy) through the caller's session, and `vocabulary.ts` derives the formulary and the
  allergen list from the clinical vocabulary the seed uses.

Two rules live in the database itself so they hold for every path. A trigger
(`enforce_room_capacity`, `security definer` so its count is complete whatever the caller's
scope) rejects placing a current resident in a room whose beds are all taken, raising a check
violation with the hint `room_full`, which the resident form shows next to the room field. A
check constraint (`residents_former_holds_no_room`) frees the bed when a stay ends.

`src/lib/care/record.integration.test.ts` runs every write as the Meadows nurse against the
seed, checks the record the page reads, archives and confirms the row is still there with the
service role, moves a resident into a full room and a free one, and repeats the writes for a
Harbor resident to see them rejected and for the admin to see them land. It puts the seed back
when it is done.

`src/lib/scope/policies.integration.test.ts` signs in as each demo account and asserts, for
residents and every clinical table, that the visible row count equals the count the generator
predicts for that account's scope; that an out-of-scope resident is "not found" by id and absent
from search; that recording care for an out-of-scope resident is rejected; and that nobody but
the service role can call `reset_demo_data()`. It reads the latest `seed_runs` row to rebuild the
exact dataset that is in the database.

## Audit trail

Every change to a tracked record becomes an audit event (ticket 06). The tracked tables are
the ones that hold resident data: `residents` and the thirteen clinical tables. An
`after insert or update or delete` row trigger on each (`record_audit_event()`) writes one row
to `audit_events` with the actor, the time, the table and row, the operation, the whole row
before and after as JSON, and, for an update, the columns that changed (`updated_at` never
counts, and an update that changes nothing else writes no event). Removals are updates that
stamp `archived_at`, so they are recorded as changes; a hard delete, which only the service
role can do, is recorded as a delete. The residents trigger covers inserts and updates only: a
resident row is never removed, and the foreign key from `audit_events` stops a hard delete of
any resident with a trail.

The actor is resolved by `current_actor_id()`:

- A signed-in user acts as themself (`current_staff_id()`), whatever else the request says.
- A service-role caller has no user, so it names the acting staff member on each request:
  over the API, the `x-caredesk-actor` request header (PostgREST exposes request headers to
  SQL, and supabase-js sends it from `global.headers`); in a direct SQL session,
  `set_config('app.actor_id', ..., true)`.
- A write with neither, or naming someone who is not staff, is rejected with a message that
  says so (hint `no_actor`), so nothing changes anonymously.

The seed is the starting state, not a change, and is not audited: the seeder sends
`x-caredesk-audit: skip` (`app.audit` in SQL) and the trigger records nothing for that
request. Only a request without a user session can skip, so a signed-in user sending the same
header is audited all the same. The integration tests use the same flag when they put the seed
back, and delete the events their own writes produced.

Events are readable within the resident's scope (`resident_id in (select id from residents)`),
the same rule as every clinical table, and are append-only: the trigger function is
`security definer` so it can insert, and `insert`, `update`, and `delete` are revoked from
signed-in staff. The table is in the `supabase_realtime` publication for the activity feed
(ticket 07), which applies the same policy per subscriber. Operator-wide staff (those with no
facility, the admin) are visible to every signed-in staff member so a change the admin made is
attributed by name on a nurse's screen. `reset_demo_data()` empties the trail with the data it
describes.

The app reads the trail through `src/lib/audit/`: `events.ts` queries the events for a
resident with the actor joined and resolves the names behind foreign keys (rooms, units,
staff, medication orders) through the caller's own session; `describe.ts` turns each event
into a sentence ("discontinued the Metformin order", "moved the resident to Room 214, Unit B")
and a field-by-field before-and-after list, using the labels and formats in `columns.ts`.
`src/lib/audit/triggers.integration.test.ts` proves the actor rules, the archive-as-change
rule, the scope, and the append-only rule against the hosted project.

## Dashboard

The six tiles (ticket 07) are counts over the caller's scope, computed in the database so a
nurse's numbers and an admin's come from the same query under different policies:

- `resident_dashboard_at(as_of)` is the resident directory (current residents) with one
  boolean per tile, computed as of an instant: `overdue_assessment` (the assessment summary's
  rule, using `assessment_kinds`), `out_of_range_vitals` (a set in the last 24 hours with a
  reading outside `vital_ranges`), `recent_incident` (seven days), `upcoming_appointment` (a
  scheduled appointment on that date or the next), `medication_due` (a scheduled dose in the
  current shift with nothing recorded within two hours of its time), and
  `medication_overdue` (such a dose in the last 24 hours more than an hour past its time).
  The app calls it with now; the tests call it with the seed's anchor so the answer is
  deterministic. The resident list reads it too, when a tile's link opens the list with a
  `focus`, so the number on the tile and the people behind it are one query.
- `dashboard_tiles_at(as_of)` counts those flags and adds beds, incidents, appointments by
  day, and the shift the medication tile covers.
- `unit_occupancy` is beds and current residents per unit in scope, for the census chart.
- `shift_window(at)` and `vitals_out_of_range(vitals)` are the pieces the two functions share;
  the latter has no `search_path` setting, against the convention, because a SQL function
  with one is never inlined and this one runs once per scanned row.

The thresholds are reference data: `vital_ranges`, `medication_dose_times` (the standard hours
for each frequency; weekly on Monday), and `shifts`. `src/lib/clinical/` keeps a copy of each
(`vital-ranges.ts`, `medication-schedule.ts`, `shifts.ts`), `src/lib/dashboard/rules.ts` states
the same rules in TypeScript, and `src/lib/dashboard/dashboard.integration.test.ts` proves the
database agrees with them: for the nurse and the admin, every count from the seed equals the
function's, and every focus lists the same residents.

The activity feed reads `audit_events` newest first through `src/lib/audit/events.ts` and then
subscribes to inserts over Realtime (`src/components/dashboard/activity-feed.tsx`). Realtime
evaluates the events policy for each subscriber, so a nurse is told about their units only;
the browser then reads each announced event back through the caller's session (a server
action) to tell it as a sentence, which applies the policy a second time. The integration test
subscribes as the Meadows nurse, writes an event for a Harbor resident and one for a Meadows
resident, and hears only the second.

## Simulator

`pnpm simulate` (`scripts/simulator/run.ts`) has the ten simulated nurses record care until it
is stopped (ticket 08): vitals, administrations, progress notes, incidents, resident details, and
appointments, each on a resident of the nurse's own units. It shares the seed's text templates,
the clinical rules in `src/lib/clinical/`, and the dashboard's dose rules, so a simulated record
is indistinguishable from a seeded one, and it writes through the audit trigger's service-role
path (above), so the feed names the nurse. `--pace 10` runs it ten times faster, `--for 2m` stops
it after two minutes, `--seed 7` replays the same choices; Ctrl-C stops it after the action in
flight, and it exits 1 if any write was rejected.

- `src/lib/simulator/rhythm.ts` is the shift rhythm: five bands of the day weight the six kinds
  of action (vitals and resident details in the morning, the medication pass at midday and in
  the evening, notes and scheduling in the afternoon), and the night is quiet: no paperwork,
  mostly notes and checks, intervals two and a half times longer. At pace 1 an action lands every
  30 to 90 seconds by day.
- `actions.ts` plans one action of a kind for a nurse, or none when nothing of that kind is
  plausible, in which case the loop tries the hour's next likeliest kind: only current residents
  on the nurse's own units; a dose only against an active order, and only when it is outstanding
  around now (up to three hours late, an hour early) or an as-needed order not given in six
  hours; vitals a small step from the resident's last set, drifting back toward typical, within
  bounds a resident could have, an excursion four percent of the time; incidents at a low rate
  weighted by fall risk; room moves into a free bed on the nurse's units; diet, mobility, and
  code status one step at a time.
- `simulator.ts` is the loop: pick a nurse, load their units, try the hour's kinds in weighted
  order until one is plausible, write it, wait. A rejected write is counted and logged, never
  retried; a round that throws waits ten seconds and moves on.
- `supabase-store.ts` reads with one service-role client and writes with one client per nurse
  whose requests carry `x-caredesk-actor`, so the audit trigger attributes each change to that
  nurse. It reads in pages of a thousand rows, PostgREST's cap on one response.
  `memory-store.ts` is the store the unit tests run over, with a fake clock.

`src/lib/simulator/rhythm.test.ts` and `simulator.test.ts` cover action selection by time of day
and every plausibility rule over the in-memory store; `simulator.integration.test.ts` writes
every kind of action through the service role as a simulated nurse, checks that the audit event
names that nurse, runs a few rounds of the loop, and puts the rows back. The policy and
dashboard tests compare the database with the seed, so reseed after a simulator run before
`pnpm check`.

## Types

`src/lib/supabase/database.types.ts` is maintained by hand in the shape `supabase gen types`
produces, because generating over `--db-url` needs Docker. When a migration changes a table,
update the matching `Row`, `Insert`, and `Relationships` entries in the same commit.

## Conventions

- Every table that holds resident data gets Row Level Security policies in the same migration that
  creates it (ADR 0003).
- Functions set `search_path = ''` and are `security invoker` unless there is a written reason
  otherwise. The scope helpers above are the written reason.
- Views are `security_invoker = true`.
- Every table has `created_at`, `updated_at` (kept current by `set_updated_at()`), and
  `archived_at` for soft deletes.
- The seeder and simulator connect with the secret key and set an explicit actor; the web app never
  uses the secret key.
- Reference data that is not resident data (`assessment_kinds`, `seed_runs`) is readable by any
  signed-in staff member.
- `assessment_kinds` holds each kind's due interval; `src/lib/clinical/assessment-kinds.ts` is a
  copy for code that needs the names without a round trip, and the policy test checks they agree.
