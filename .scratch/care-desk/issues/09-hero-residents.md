# 09: Hero residents

**What to build:** Ten hand-authored residents with coherent, interesting stories are layered into the seed so the demo script always has something to show. After a reseed, each hero is present with exactly their authored facts, and the seed remains deterministic.

**Blocked by:** 03 (Clinical schema and the deterministic seed). Can run in parallel with tickets 04 to 08.

**Status:** ready-for-agent

- [ ] Hero residents are defined as authored data, separate from the generated population, and merged by the seed generator with stable identities and rooms
- [ ] Two residents surnamed Doe live in different facilities; one has an overdue podiatry assessment and a recent physician visit
- [ ] One resident has a new medication order that conflicts with a documented allergy
- [ ] One resident has two falls in the last thirty days and an overdue fall-risk assessment
- [ ] One resident was readmitted from hospital within the last two weeks with medication orders discontinued and added around the readmission
- [ ] One resident has dementia, a daughter recorded as primary family contact, and progress notes mentioning her calls
- [ ] Five further heroes vary lighter themes (a dialysis appointment pattern, a wound-check series, a resident who recently became a former resident, a weight-loss trend in vitals, a care plan with an unmet goal)
- [ ] Each hero's conditions, medications, notes, and timeline are mutually consistent and drawn from the clinical vocabulary where a code applies
- [ ] The seeded nurse logins are assigned so that the first nurse can see one Doe and not the other, and the admin can see both
- [ ] Tests assert every hero exists after a reseed with their authored facts, and the determinism test from ticket 03 still passes
