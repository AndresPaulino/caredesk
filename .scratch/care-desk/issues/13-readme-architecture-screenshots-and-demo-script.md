# 13: README, architecture diagram, screenshots, and demo script

**What to build:** The repository presents itself. A prospect reading the README understands what CareDesk is, how the privacy model works, how the assistant answers without seeing more than the user, and how to run it. Screenshots show the product without running it. A demo script lists the on-camera sequence and what each step demonstrates, so recording takes one take.

**Blocked by:** 09 (Hero residents), 12 (End-to-end smoke test and CI hardening)

**Status:** ready-for-agent

- [ ] The README covers: what CareDesk is and who it is for, the synthetic-data disclaimer, an architecture section with a diagram (Next.js, Supabase with Row Level Security and Realtime, the assistant's tool layer, the simulator, the seed), the privacy model in plain language, setup and run instructions including the environment variables and the reset-and-reseed command, how to start the simulator, how to run the tests, and credit to Synthea under Apache 2.0
- [ ] A "what a production version adds" section lists PHI minimization, break-the-glass access, write actions with confirmation, rate limiting, and scheduled resets
- [ ] A screenshots directory holds current captures of the login page, the admin dashboard with the feed moving, a hero resident's page with the timeline, the audit trail tab, and the assistant answering the Doe question, each referenced from the README
- [ ] The demo script lists the sequence: log in as the nurse, dashboard, a hero resident, the assistant questions in order with the expected answers, the scope contrast as the admin, the audit trail; each step names what it demonstrates
- [ ] Setup instructions are verified by following them on a fresh clone
