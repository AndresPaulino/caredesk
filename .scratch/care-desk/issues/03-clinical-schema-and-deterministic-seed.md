# 03: Clinical schema and the deterministic seed

**What to build:** One command resets the database and rebuilds the full Willowbrook Care dataset: about 1,000 residents across six facilities with conditions, allergies, medication orders and administrations, vitals, assessments, lab results, care plans, incidents, progress notes, appointments, and family contacts, all drawn from the committed clinical vocabulary. Running it twice yields identical data. The resident list from ticket 02 now shows the real population, and every new table is protected by the same scope policies.

**Blocked by:** 02 (Login, roles, and the scoped resident list)

**Status:** ready-for-agent

- [ ] Migrations add every clinical table from the spec's data model, with assessments carrying a kind and each kind having a due interval, and with soft-delete columns everywhere
- [ ] Row Level Security policies on every clinical table resolve scope through the resident (ADR 0003), and the policy tests from ticket 02 are extended to cover each new table for all three users
- [ ] A generator module reads the vocabulary catalogs and produces the dataset from a fixed seed: realistic names from the name pools, an age distribution centered in the mid-eighties, conditions paired with the medications the catalog says treat them, allergies with reactions, vitals and lab values within the catalog's percentile ranges, assessments with plausible last-done dates, and about 100 former residents whose activity stops when their stay ended
- [ ] A single reset-and-reseed command truncates and rebuilds everything, including the three login accounts, in under a minute against the hosted project
- [ ] Row counts land within twenty percent of the spec's budget for every table
- [ ] Unit tests prove determinism (same seed, identical output), budget adherence, that every medication order references a catalog entry, and that former residents have no activity after their end date
- [ ] The provisional seed script from ticket 02 is removed in favor of the real one
