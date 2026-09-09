# Clinical vocabulary

Catalogs the seed generator draws from when it creates residents, conditions, medication orders, assessments, allergies, vitals, and lab results. Every entry is aggregate vocabulary, a co-occurrence count, a value distribution, or a name pool. No patient records were copied.

## Provenance

Derived from one run of [Synthea](https://github.com/synthetichealth/synthea) v4.0.0 (The MITRE Corporation, Apache License 2.0), generating 1,000 living synthetic patients aged 65 and over in Massachusetts, exported as CSV. See `manifest.json` for the exact command and source row counts, and ADR 0002 for why we keep the vocabulary but not the patients.

## Files

| File | What it holds |
|---|---|
| `conditions.json` | Top 160 clinical conditions by active prevalence, with SNOMED codes and a chronic flag |
| `conditions-social-excluded.json` | Social-determinant findings removed from the list above, kept for transparency |
| `medications.json` | Top 160 medications with RxNorm codes, prevalence, active share, and the conditions they were ordered for |
| `procedures.json` | Top 120 procedures with codes and the conditions that prompted them |
| `allergies.json` | Every allergy seen, with category, type, and observed reactions and severities |
| `observations.json` | Vitals, labs, and surveys seen at least 300 times, with units and value percentiles |
| `careplans.json` | Care plan types and the conditions they address |
| `immunizations.json` | Immunizations and their frequency |
| `encounters.json` | Encounter classes, encounter types, and encounter reasons |
| `demographics.json` | Gender, race, ethnicity, and marital distributions, Massachusetts cities, and first and last name pools |
| `manifest.json` | Source, command, generation date, row counts, and extraction notes |

## Regenerating

These files are derived artifacts. Do not hand-edit them. To regenerate, run Synthea with the command in `manifest.json`, then run the extraction script in the repo's `scripts` directory against the CSV output directory:

```
python3 scripts/extract-synthea-vocabulary.py <synthea output>/csv data/vocabulary
```

Hand-authored clinical detail belongs in the hero residents, not here.
