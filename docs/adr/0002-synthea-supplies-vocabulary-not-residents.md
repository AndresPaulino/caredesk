---
status: accepted
---

# Synthea supplies the clinical vocabulary, not the resident records

Realistic clinical data was the credibility requirement for the seed. We generated 1,000 elderly patients with Synthea v4.0.0 and measured the result: about 5.9 million rows, a uniform age distribution from 65 to 139, digit-suffixed names, no facility concepts at all, and roughly sixty times our row budget. Importing those patients would mean discarding almost all of them and still writing the care-home layer by hand. We instead ran Synthea once, extracted aggregate vocabulary into JSON catalogs committed under `data/vocabulary` (conditions, medications with the conditions they treat, procedures, allergies with reactions, observation value ranges, encounter reasons, name pools, demographics), and let a deterministic generator draw from those catalogs.

## Consequences

- No Java or Synthea in the build. Anyone cloning the repo can reseed from the committed catalogs.
- The generator controls size, age distribution, and coherence directly.
- The catalogs are derived artifacts. Regenerate them by re-running Synthea and the extraction script rather than hand-editing them; hand-authored additions belong in the hero residents, not the catalogs.
- Synthea (The MITRE Corporation, Apache License 2.0) is credited in the README.
