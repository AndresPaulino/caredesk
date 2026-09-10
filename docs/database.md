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

The generator lives in `src/lib/seed/` and is shared with the tests and, later, the simulator:

- `vocabulary.ts` reads the catalogs under `data/vocabulary/` (ADR 0002) and decides which
  entries a care-home record uses and how often. Synthea's prevalence describes a general
  elderly population, so the care-home prevalence of each condition is set there.
- `organization.ts` builds the six facilities, four units each, thirty rooms per unit (ten
  semi-private), the demo accounts, and two physicians and eight nurses per facility, ten of the
  nurses flagged as simulated staff.
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
