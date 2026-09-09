# 01: Scaffold, CI, and a database health page

**What to build:** A fresh clone with an environment file boots CareDesk locally on the house stack and shows an app shell with the synthetic-data banner and a health page that proves the hosted Supabase project is reachable. Continuous integration runs lint, typecheck, and the unit suite on every push.

**Blocked by:** None (can start immediately). Requires the human prerequisites from the spec: a hosted Supabase project and a Claude Console API key, both placed in the local environment file.

**Status:** ready-for-agent

- [ ] Next.js App Router, TypeScript strict, Tailwind, shadcn, zod, pnpm, Vitest, ESLint, and Prettier are set up with sensible scripts for dev, build, lint, typecheck, and test
- [ ] Environment configuration is validated at startup; a missing or malformed variable fails fast with a message naming it
- [ ] Server-side and browser-side Supabase clients exist, and a migration workflow against the hosted project is documented and works without Docker
- [ ] The app shell has a navigation frame and a persistent banner stating the data is synthetic and the product is a demonstration
- [ ] A health page reports database connectivity and the database's current time
- [ ] The Anthropic SDK is installed and a startup check confirms the API key is present without making a paid call
- [ ] GitHub Actions runs lint, typecheck, and the unit suite and is green
- [ ] The README has a minimal "run it locally" section listing the required environment variables (the full README comes in ticket 13)
