# 12: End-to-end smoke test and CI hardening

**What to build:** One browser test proves the whole path works: log in as the nurse, open a hero resident, ask the assistant a fixed question, and see an answer with a source chip. Continuous integration always runs lint, typecheck, and the unit suite, and runs the database-backed integration tests when connection secrets are present. The policy tests cover every table that holds resident data.

**Blocked by:** 08 (Simulator with simulated staff and a shift rhythm), 11 (Assistant: full tool set, source chips, saved threads, and AI audit)

**Status:** ready-for-agent

- [ ] A Playwright smoke test logs in as the nurse, opens a hero resident, asks a fixed question, and asserts an answer containing at least one source chip; it is the only test that calls the model
- [ ] Database-backed tests skip cleanly with a visible reason when the connection variables are absent, so the unit suite always runs
- [ ] GitHub Actions runs lint, typecheck, and the unit suite on every push, and runs the integration and smoke suites on the main branch when secrets are configured
- [ ] Policy tests enumerate every table holding resident data and assert scoped reads for all three users and a rejected out-of-scope write for the nurse
- [ ] The reset-and-reseed command is run at the start of the integration suite so tests never depend on leftover state, and the simulator is not running during tests
- [ ] The full suite passes locally against the hosted project and CI is green
