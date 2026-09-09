# 02: Login, roles, and the scoped resident list

**What to build:** Staff sign in with email and password and land on a resident list that already respects scope: a nurse sees only residents on their assigned units, an admin sees every resident across all six facilities. The boundary is enforced by Row Level Security, so a resident outside scope is absent from search and returns "not found" by direct link.

**Blocked by:** 01 (Scaffold, CI, and a database health page)

**Status:** ready-for-agent

- [ ] Migrations create facilities, units, rooms, staff, and residents, with staff carrying a role, a facility, and unit assignments for nurses, and login-capable staff linked to an auth user
- [ ] Row Level Security policies on residents and the organization tables implement the scope rule from the spec; nurse scope resolves through unit assignments, admin scope is everything
- [ ] Three seeded logins exist: a nurse at one facility, a nurse at a different facility, and an operator-wide admin; the login page shows their credentials in a callout
- [ ] Sign-in, sign-out, and route protection work; unauthenticated visitors are sent to the login page
- [ ] A provisional seed script creates six facilities with units and rooms and a few dozen residents spread across them, enough to demonstrate scope (the full seed arrives in ticket 03)
- [ ] The resident list supports search by name and room and filters by facility, unit, and status, all within scope
- [ ] A minimal resident page shows demographics, facility, unit, room, admission date, and status
- [ ] Policy tests read residents as each of the three users and assert the expected counts, and assert that a direct fetch of an out-of-scope resident returns nothing
- [ ] Application data access uses the signed-in user's session; the service role is not used by any request path (ADR 0003)
