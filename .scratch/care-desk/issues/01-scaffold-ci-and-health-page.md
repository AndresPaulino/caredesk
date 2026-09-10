# 01: Scaffold, CI, and a database health page

**What to build:** A fresh clone with an environment file boots CareDesk locally on the house stack and shows an app shell with the synthetic-data banner and a health page that proves the hosted Supabase project is reachable. Continuous integration runs lint, typecheck, and the unit suite on every push.

**Blocked by:** None (can start immediately). Requires the human prerequisites from the spec: a hosted Supabase project and a Claude Console API key, both placed in the local environment file.

**Status:** resolved

- [x] Next.js App Router, TypeScript strict, Tailwind, shadcn, zod, pnpm, Vitest, ESLint, and Prettier are set up with sensible scripts for dev, build, lint, typecheck, and test
- [x] Environment configuration is validated at startup; a missing or malformed variable fails fast with a message naming it
- [x] Server-side and browser-side Supabase clients exist, and a migration workflow against the hosted project is documented and works without Docker
- [x] The app shell has a navigation frame and a persistent banner stating the data is synthetic and the product is a demonstration
- [x] A health page reports database connectivity and the database's current time
- [x] The Anthropic SDK is installed and a startup check confirms the API key is present without making a paid call
- [x] GitHub Actions runs lint, typecheck, and the unit suite and is green
- [x] The README has a minimal "run it locally" section listing the required environment variables (the full README comes in ticket 13)

## Comments

**2026-09-09, agent.** Implemented on Next.js 16.3.4 with Node 22 (`.nvmrc`) because Vitest 4 needs a newer Node than the machine's 20.11. Verified locally: `pnpm check` (lint, format, typecheck, unit tests) and `pnpm build` pass; the dev server boots with `[caredesk] configuration ok`; a blank `ANTHROPIC_API_KEY` stops startup with a message naming the variable; `/` renders the banner and nav; `/health` reaches the hosted project and reports the `health_check` function is not there yet; `/api/health` returns 503 with the same detail.

Three boxes stay open until a human step is done:

- **Supabase clients and migration workflow**: code and docs are in place (`src/lib/supabase/`, `docs/database.md`, `pnpm db:push`), and the CLI was confirmed to connect without Docker, but the first migration cannot be applied without `DATABASE_URL` in `.env.local`. The dashboard's Connect panel, Session pooler, gives it.
- **Health page reports the database's current time**: it will once `pnpm db:push` has run; today it correctly reports the missing function.
- **GitHub Actions is green**: `.github/workflows/ci.yml` is written but the repo has no GitHub remote yet, so it has never run.

**2026-09-09, agent.** `DATABASE_URL` (session pooler) added by Andres; `pnpm db:push` applied `20260909120000_health_check.sql` and `pnpm db:status` shows local and remote in step. `/health` now reports the database clock with a round trip of a few hundred milliseconds, and `/api/health` returns 200. The Anthropic key was rotated and the new one passes the startup check. Only the CI box stays open: the workflow is committed but cannot run until the repo has a GitHub remote. Marking the ticket resolved so ticket 02 is unblocked; confirm CI is green when the remote is added.


**2026-09-09, agent.** Remote added and pushed; CI run on 6ec4f14 completed green (https://github.com/AndresPaulino/caredesk/actions/runs/34425850204). All acceptance criteria met.
