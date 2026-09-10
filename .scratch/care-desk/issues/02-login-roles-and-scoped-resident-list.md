# 02: Login, roles, and the scoped resident list

**What to build:** Staff sign in with email and password and land on a resident list that already respects scope: a nurse sees only residents on their assigned units, an admin sees every resident across all six facilities. The boundary is enforced by Row Level Security, so a resident outside scope is absent from search and returns "not found" by direct link.

**UI approach (ADR 0004):** login page from the `@shadcn/login-03` block with the demo credentials callout added; replace the ticket 01 top bar with the `@shadcn/sidebar-07` shell (collapses to icons, user menu with sign-out); resident list from the shadcn data table pattern, which `@shadcn/dashboard-01` includes ready to copy. Rename block internals to the glossary's terms before closing.

**Blocked by:** 01 (Scaffold, CI, and a database health page)

**Status:** resolved

- [x] Migrations create facilities, units, rooms, staff, and residents, with staff carrying a role, a facility, and unit assignments for nurses, and login-capable staff linked to an auth user
- [x] Row Level Security policies on residents and the organization tables implement the scope rule from the spec; nurse scope resolves through unit assignments, admin scope is everything
- [x] Three seeded logins exist: a nurse at one facility, a nurse at a different facility, and an operator-wide admin; the login page shows their credentials in a callout
- [x] Sign-in, sign-out, and route protection work; unauthenticated visitors are sent to the login page
- [x] A provisional seed script creates six facilities with units and rooms and a few dozen residents spread across them, enough to demonstrate scope (the full seed arrives in ticket 03)
- [x] The resident list supports search by name and room and filters by facility, unit, and status, all within scope
- [x] A minimal resident page shows demographics, facility, unit, room, admission date, and status
- [x] Policy tests read residents as each of the three users and assert the expected counts, and assert that a direct fetch of an out-of-scope resident returns nothing
- [x] Application data access uses the signed-in user's session; the service role is not used by any request path (ADR 0003)

## Comments

**2026-09-09, agent.** Implemented and verified against the hosted project.

- **Schema**: `supabase/migrations/20260910090000_organization_and_residents.sql` creates facilities, units, rooms, staff (role, home facility, optional `auth_user_id`), staff unit assignments, and residents (demographics, facility, unit, room, admission date, status with stay-end date and reason, code status, diet, mobility, soft-delete columns everywhere). Composite foreign keys keep a resident's unit inside their facility and their room on their unit. Applied with `pnpm db:push`.
- **Scope**: `security definer` helpers (`current_staff_id`, `is_admin`, `current_unit_ids`, `current_facility_ids`) feed select policies on every organization table and select and update policies on residents. The app reads the `resident_directory` view (`security_invoker`), which adds facility, unit, and room names and a `search_text` column. Documented in `docs/database.md`.
- **Seed and logins**: `pnpm db:seed` (`scripts/seed/provisional.ts`, deterministic data in `provisional-data.ts` with stable ids) builds six facilities, four units each, 30 rooms per unit, 72 residents (three per unit, one former per facility), and the three demo accounts defined once in `src/lib/demo-accounts.ts`: Maria Alvarez (nurse, Meadows, Units A and B, 6 residents), Daniel Okafor (nurse, Harbor, Units A to C, 9 residents), Priya Natarajan (admin, 72 residents). Password `willowbrook-demo`. The login page lists them with one-click sign-in.
- **Auth**: `src/proxy.ts` refreshes the session and sends unauthenticated visitors to `/login?next=...`; `/health` and `/api/health` stay public. `getCurrentStaff()` (`src/lib/auth/current-staff.ts`) verifies the token and reads the staff row through RLS; the signed-in layout and every page call `requireStaff()`. Sign-in and sign-out are server actions; the login form also works without JavaScript.
- **UI (ADR 0004)**: `@shadcn/login-03` became the login page with the demo credentials card; `@shadcn/sidebar-07` replaced the top bar (brand, Dashboard and Residents, System health, staff menu with scope and sign-out, collapses to icons); the resident list uses the shadcn data table pattern on TanStack Table v9 (`src/components/data-table/`) with server-side sorting, filtering, and paging driven by the URL (`src/lib/residents/list-params.ts`). Block internals were renamed to the glossary's terms; nothing called "user", "project", or "team" survived. The minimal resident page shows demographics, stay, and care facts.
- **Tests**: 37 pass. `src/lib/scope/policies.integration.test.ts` signs in as each account and asserts exact visible resident ids, that a nurse sees one facility and their units, that an out-of-scope resident is null by id and absent from search, that an out-of-scope update touches zero rows, that moving a resident to an uncovered unit is rejected, and that an anonymous client sees nothing. It runs when `.env.local` is present and is skipped in CI. Unit tests cover the seed's determinism and counts, list-param parsing, hrefs, date helpers, and breadcrumbs.
- **Verified live** on the dev server: unauthenticated redirects, the no-JS sign-in post (303 with the session cookie; wrong password and malformed input show their messages), each account's dashboard and list counts, the admin's 72 residents across three pages, facility filtering, search by room, sorting, and the Meadows nurse getting "Resident not found" for a Harbor resident that the admin can open. `pnpm check` and `pnpm build` pass.

Notes for later tickets: `src/lib/supabase/database.types.ts` is hand-maintained (the CLI's type generator needs Docker); update it with each migration. The residents `update` policy is in place for ticket 05. The provisional seed is replaced by ticket 03.
