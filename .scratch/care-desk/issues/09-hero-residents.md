# 09: Hero residents

**What to build:** Ten hand-authored residents with coherent, interesting stories are layered into the seed so the demo script always has something to show. After a reseed, each hero is present with exactly their authored facts, and the seed remains deterministic.

**Blocked by:** 03 (Clinical schema and the deterministic seed). Can run in parallel with tickets 04 to 08.

**Status:** ready-for-human (review)

- [x] Hero residents are defined as authored data, separate from the generated population, and merged by the seed generator with stable identities and rooms
- [x] Two residents surnamed Doe live in different facilities; one has an overdue podiatry assessment and a recent physician visit
- [x] One resident has a new medication order that conflicts with a documented allergy
- [x] One resident has two falls in the last thirty days and an overdue fall-risk assessment
- [x] One resident was readmitted from hospital within the last two weeks with medication orders discontinued and added around the readmission
- [x] One resident has dementia, a daughter recorded as primary family contact, and progress notes mentioning her calls
- [x] Five further heroes vary lighter themes (a dialysis appointment pattern, a wound-check series, a resident who recently became a former resident, a weight-loss trend in vitals, a care plan with an unmet goal)
- [x] Each hero's conditions, medications, notes, and timeline are mutually consistent and drawn from the clinical vocabulary where a code applies
- [x] The seeded nurse logins are assigned so that the first nurse can see one Doe and not the other, and the admin can see both
- [x] Tests assert every hero exists after a reseed with their authored facts, and the determinism test from ticket 03 still passes

## Comments

**2026-09-10, agent.** Built. Notes for review:

- `src/lib/seed/heroes.ts` holds the ten heroes as authored facts (identity, room, conditions, allergies, the whole medication list, the assessments the story turns on, incidents, notes, contacts, a care plan, vitals baselines), every date relative to the anchor so the story is true on every reseed. `residents.ts` layers them into the population: each hero takes a headcount slot on their unit and a current hero's room is reserved before the generated residents fill the beds, so the totals stay at 900 current and 100 former and every existing count test holds. `records.ts` turns the facts into rows and generates whatever the story leaves open (administrations, daily vitals, lab results, routine assessments), so a hero's chart is as full as anyone's. Ids derive from the hero key (`heroResidentId("doe-meadows")`) and survive a change of seed number; `seed.heroes` lists them for later tickets, and `pnpm db:seed` prints them with their rooms and stories.
- The spec's own arithmetic gives eleven stories for ten residents, so the Harbor Doe carries the dialysis pattern: Walter Doe (Harbor, Unit B, Room 212) is on dialysis Monday, Wednesday, and Friday with a podiatry exam 23 days ago, against Harold Doe (Meadows, Unit A, Room 104) with podiatry 131 days ago and a physician visit 4 days ago. The Meadows nurse sees Harold and not Walter, the Harbor nurse the reverse, the admin both. The other heroes: Margaret Kowalski (Meadows B 218, sulfamethoxazole/trimethoprim ordered today against a documented allergy, no dose given yet, the only conflict in the seed), Eugene Barlow (Meadows A 115, falls 9 and 23 days ago, fall-risk assessment 112 days ago), Frank Moreau (Harbor A 121, hospital transfer 16 days ago, back 11 days ago, furosemide and lisinopril discontinued at transfer, furosemide twice daily, losartan, and metoprolol started on return), Rose Delgado (Meadows B 207, Alzheimer's, daughter Teresa is primary contact and four evening notes record her calls), Samuel Whitcomb (Orchard A 118, five weekly wound checks from 3.7 by 2.6 cm down to 2.1 by 1.4), Irene Castellano (Commons D, discharged home 6 days ago after hip-fracture rehabilitation), Clara Beaumont (Bayview B 226, weekly weights down 11 pounds in five weeks), and Vernon Pryor (Pines C 309, hypertension care plan with the blood-pressure goal not met, morning systolic in the 150s so the out-of-range tile picks him up). Four of them sit on the Meadows nurse's units so ticket 10's suggested prompts land in her scope.
- Every code is from the vocabulary: `heroes.test.ts` resolves each condition, medication, allergen (with its catalog reaction and severity), and care plan pairing, then checks each authored fact against the built seed; `seed.test.ts` now exempts hero names from the pool check and requires exactly one allergy conflict in the seed, on that hero. `heroes.integration.test.ts` reads every hero back from the hosted project through the app's own `getResident` and checks the Doe split; the resident-page integration test now also asserts the hero conflict is flagged as the nurse and picks a non-hero for its insert case. The determinism test is unchanged and passes.
- Docs: `docs/database.md` gains a "Hero residents" section with the table of who is where; the README mentions them. CONTEXT.md's "Hero resident" entry already fit.
