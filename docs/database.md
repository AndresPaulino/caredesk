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

`pnpm db:seed` (`scripts/seed/provisional.ts`) connects with `SUPABASE_SECRET_KEY`, creates the
three demo auth users if they are missing (and resets their password to the demo password), then
clears and rebuilds the organization and resident tables from `scripts/seed/provisional-data.ts`.
The dataset is derived from a fixed seed and ids are stable across runs, so links keep working
after a reseed. The full generator arrives with ticket 03.

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

`src/lib/scope/policies.integration.test.ts` signs in as each demo account and asserts the
visible row counts, that an out-of-scope resident is "not found" by id and absent from search,
and that out-of-scope writes are rejected.

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
