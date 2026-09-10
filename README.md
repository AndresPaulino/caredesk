# CareDesk

A demonstration care-home operations dashboard for a fictional operator, Willowbrook Care, with a
natural-language assistant that answers questions from live, permission-scoped resident records.
Every resident, staff member, and record is synthetic.

The full README, with the architecture, the privacy model, and screenshots, arrives with the
final ticket. This section is enough to run it.

## Run it locally

Requirements: Node 22 (`.nvmrc` pins it; `nvm use` picks it up), pnpm 9 (`corepack enable` installs the
pinned version), a hosted Supabase project, and a Claude Console API key.

```sh
pnpm install
cp .env.example .env.local   # then fill in the values below
pnpm db:push                 # apply migrations to the hosted project
pnpm dev                     # http://localhost:3000
```

Open [http://localhost:3000/health](http://localhost:3000/health) to confirm the database and
the assistant are configured. A missing or malformed variable stops the server at startup with a
message naming it.

Then seed the demo data and sign in:

```sh
pnpm db:seed                 # six facilities, ~1,000 residents with clinical records, three demo logins
pnpm simulate                # optional: simulated nurses record care until Ctrl-C, so the feed moves
```

The seed is generated, not stored: about 59,000 rows drawn from the committed clinical
vocabulary, identical on every run, rebuilt in well under a minute. Recent records are placed
around the moment you run it, so there is always something due today and overdue since last
week. Ten hand-authored hero residents (two of them named Doe, in different facilities) carry
the stories the demo relies on; the command lists them when it finishes. See
[docs/database.md](docs/database.md#seeding).

### Demo accounts

The login page lists them. The password for every account is `willowbrook-demo`.

| Account                               | Role  | Scope                                    |
| ------------------------------------- | ----- | ---------------------------------------- |
| `maria.alvarez@willowbrook.example`   | Nurse | Willowbrook Meadows, Units A and B       |
| `daniel.okafor@willowbrook.example`   | Nurse | Willowbrook Harbor, Units A, B, and C    |
| `priya.natarajan@willowbrook.example` | Admin | Every resident across all six facilities |

A nurse sees only residents on their units: a resident outside that scope is absent from search
and returns "not found" by direct link. The rule is enforced by Row Level Security in the
database, not by the screens (ADR 0003). `pnpm test` includes policy tests that read as each
account and assert exactly that; they run against the hosted project when `.env.local` is
present and are skipped otherwise.

### Environment variables

| Variable                               | Required               | Where it comes from                                                                   |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | yes                    | Supabase dashboard, Project Settings, API. `https://<ref>.supabase.co`                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes                    | Same page. `sb_publishable_...` (the legacy anon key also works)                      |
| `ANTHROPIC_API_KEY`                    | yes                    | Claude Console, API keys. Starts with `sk-ant-`                                       |
| `ANTHROPIC_MODEL`                      | no                     | Defaults to `claude-sonnet-5`                                                         |
| `DATABASE_URL`                         | for `pnpm db:push`     | Supabase dashboard, Connect, Session pooler. See [docs/database.md](docs/database.md) |
| `SUPABASE_SECRET_KEY`                  | for seed and simulator | Same API page. Never used by the web app                                              |

### Scripts

| Command          | What it does                                               |
| ---------------- | ---------------------------------------------------------- |
| `pnpm dev`       | Development server                                         |
| `pnpm build`     | Production build                                           |
| `pnpm check`     | Lint, format check, typecheck, and unit tests, as in CI    |
| `pnpm test`      | Unit tests (Vitest)                                        |
| `pnpm db:push`   | Apply pending migrations to the hosted project             |
| `pnpm db:status` | Compare local and remote migration history                 |
| `pnpm db:seed`   | Reset and rebuild the whole dataset and the demo logins    |
| `pnpm simulate`  | Start the simulator (`--pace 10` faster, `--for 2m` timed) |

## Credits

Clinical vocabulary is derived from [Synthea](https://github.com/synthetichealth/synthea)
(The MITRE Corporation, Apache License 2.0). See `data/vocabulary/README.md`.
