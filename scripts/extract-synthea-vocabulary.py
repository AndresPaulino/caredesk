#!/usr/bin/env python3
"""Extract a compact clinical vocabulary from a Synthea CSV export.

Reads the CSV files produced by Synthea and writes JSON catalogs that a
deterministic seed generator can draw from. No patient records are copied:
only aggregate vocabulary, co-occurrence, value distributions, and name pools.

Usage: extract_vocab.py <synthea csv dir> <output dir>
"""
import csv
import datetime
import json
import os
import random
import re
import statistics
import sys
from collections import Counter, defaultdict

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
csv.field_size_limit(1 << 30)
RNG = random.Random(42)
STATS = {}


def rows(name):
    path = os.path.join(SRC, name)
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = [h.strip().upper() for h in next(reader)]
        idx = {h: i for i, h in enumerate(header)}
        n = 0
        for line in reader:
            n += 1
            yield lambda k, _l=line, _i=idx: (_l[_i[k]] if k in _i and _i[k] < len(_l) else "")
        STATS[name] = n


def dump(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
        f.write("\n")


def top(counter, n):
    return [{"value": k, "count": v} for k, v in counter.most_common(n)]


strip_digits = lambda s: re.sub(r"\d+", "", s).strip()

# ---------------------------------------------------------------- patients
first_names = defaultdict(Counter)
last_names = Counter()
gender = Counter()
race = Counter()
ethnicity = Counter()
marital = Counter()
cities = Counter()
n_patients = 0
for g in rows("patients.csv"):
    n_patients += 1
    sex = g("GENDER")
    gender[sex] += 1
    first_names[sex][strip_digits(g("FIRST"))] += 1
    last_names[strip_digits(g("LAST"))] += 1
    race[g("RACE")] += 1
    ethnicity[g("ETHNICITY")] += 1
    marital[g("MARITAL") or "unknown"] += 1
    cities[g("CITY")] += 1

dump(
    "demographics.json",
    {
        "gender": dict(gender),
        "race": dict(race),
        "ethnicity": dict(ethnicity),
        "marital": dict(marital),
        "cities": top(cities, 40),
        "first_names": {sex: [k for k, _ in c.most_common(200)] for sex, c in first_names.items()},
        "last_names": [k for k, _ in last_names.most_common(300)],
    },
)

# ---------------------------------------------------------------- conditions
SOCIAL = re.compile(
    r"(employment|education|educated to|Stress \(finding\)|Social isolation|Limited social contact"
    r"|Medication review due|criminal record|Refugee|intimate partner|Misuses drugs"
    r"|alcohol drinking behavior|violence in the environment|access to transportation"
    r"|labor force|armed forces|Transport problem|Housing unsatisfactory|Unemployed"
    r"|Risk activity involvement|Reports of violence|Victim of|Homeless|food insecurity"
    r"|Not in labor|Lack of|Only received|Received (higher|certificate)|Part-time|Full-time"
    r"|Has a criminal)",
    re.I,
)
cond = {}
for g in rows("conditions.csv"):
    code = g("CODE")
    c = cond.setdefault(
        code,
        {"code": code, "system": g("SYSTEM"), "description": g("DESCRIPTION"), "ever": set(), "active": set()},
    )
    c["ever"].add(g("PATIENT"))
    if not g("STOP"):
        c["active"].add(g("PATIENT"))

conditions = []
excluded_social = []
for c in cond.values():
    entry = {
        "code": c["code"],
        "system": c["system"],
        "description": c["description"],
        "patients_ever": len(c["ever"]),
        "patients_active": len(c["active"]),
        "active_share": round(len(c["active"]) / n_patients, 4),
        "chronic": len(c["active"]) >= 0.5 * len(c["ever"]) and len(c["active"]) > 0,
    }
    (excluded_social if SOCIAL.search(c["description"]) else conditions).append(entry)
conditions.sort(key=lambda e: (-e["patients_active"], -e["patients_ever"]))
dump("conditions.json", conditions[:160])
dump("conditions-social-excluded.json", sorted(excluded_social, key=lambda e: -e["patients_ever"]))

# ---------------------------------------------------------------- medications
med = {}
for g in rows("medications.csv"):
    code = g("CODE")
    m = med.setdefault(
        code,
        {"code": code, "description": g("DESCRIPTION"), "patients": set(), "orders": 0, "active": 0, "reasons": Counter(), "reason_desc": {}},
    )
    m["patients"].add(g("PATIENT"))
    m["orders"] += 1
    if not g("STOP"):
        m["active"] += 1
    rc = g("REASONCODE")
    if rc:
        m["reasons"][rc] += 1
        m["reason_desc"][rc] = g("REASONDESCRIPTION")

medications = sorted(
    (
        {
            "code": m["code"],
            "system": "RxNorm",
            "description": m["description"],
            "patients": len(m["patients"]),
            "orders": m["orders"],
            "active_share": round(m["active"] / m["orders"], 4),
            "reasons": [
                {"code": rc, "description": m["reason_desc"][rc], "orders": n} for rc, n in m["reasons"].most_common(5)
            ],
        }
        for m in med.values()
    ),
    key=lambda e: -e["patients"],
)
dump("medications.json", medications[:160])

# ---------------------------------------------------------------- procedures
proc = {}
for g in rows("procedures.csv"):
    code = g("CODE")
    p = proc.setdefault(
        code,
        {"code": code, "system": g("SYSTEM"), "description": g("DESCRIPTION"), "patients": set(), "count": 0, "reasons": Counter(), "reason_desc": {}},
    )
    p["patients"].add(g("PATIENT"))
    p["count"] += 1
    rc = g("REASONCODE")
    if rc:
        p["reasons"][rc] += 1
        p["reason_desc"][rc] = g("REASONDESCRIPTION")

procedures = sorted(
    (
        {
            "code": p["code"],
            "system": p["system"],
            "description": p["description"],
            "patients": len(p["patients"]),
            "count": p["count"],
            "reasons": [
                {"code": rc, "description": p["reason_desc"][rc], "count": n} for rc, n in p["reasons"].most_common(5)
            ],
        }
        for p in proc.values()
    ),
    key=lambda e: -e["patients"],
)
dump("procedures.json", procedures[:120])

# ---------------------------------------------------------------- allergies
alg = {}
for g in rows("allergies.csv"):
    code = g("CODE")
    a = alg.setdefault(
        code,
        {"code": code, "system": g("SYSTEM"), "description": g("DESCRIPTION"), "category": g("CATEGORY"), "type": g("TYPE"), "patients": set(), "reactions": Counter()},
    )
    a["patients"].add(g("PATIENT"))
    for k in ("1", "2"):
        if g("DESCRIPTION" + k):
            a["reactions"][(g("REACTION" + k), g("DESCRIPTION" + k), g("SEVERITY" + k))] += 1

allergies = sorted(
    (
        {
            "code": a["code"],
            "system": a["system"],
            "description": a["description"],
            "category": a["category"],
            "type": a["type"],
            "patients": len(a["patients"]),
            "reactions": [
                {"code": rc, "description": d, "severity": s, "count": n} for (rc, d, s), n in a["reactions"].most_common(6)
            ],
        }
        for a in alg.values()
    ),
    key=lambda e: -e["patients"],
)
dump("allergies.json", allergies)

# ---------------------------------------------------------------- care plans
cp = {}
for g in rows("careplans.csv"):
    code = g("CODE")
    c = cp.setdefault(code, {"code": code, "description": g("DESCRIPTION"), "patients": set(), "reasons": Counter(), "reason_desc": {}})
    c["patients"].add(g("PATIENT"))
    rc = g("REASONCODE")
    if rc:
        c["reasons"][rc] += 1
        c["reason_desc"][rc] = g("REASONDESCRIPTION")
dump(
    "careplans.json",
    sorted(
        (
            {
                "code": c["code"],
                "description": c["description"],
                "patients": len(c["patients"]),
                "reasons": [{"code": rc, "description": c["reason_desc"][rc], "count": n} for rc, n in c["reasons"].most_common(5)],
            }
            for c in cp.values()
        ),
        key=lambda e: -e["patients"],
    ),
)

# ---------------------------------------------------------------- immunizations
imm = {}
for g in rows("immunizations.csv"):
    code = g("CODE")
    i = imm.setdefault(code, {"code": code, "description": g("DESCRIPTION"), "patients": set(), "count": 0})
    i["patients"].add(g("PATIENT"))
    i["count"] += 1
dump(
    "immunizations.json",
    sorted(({"code": i["code"], "description": i["description"], "patients": len(i["patients"]), "count": i["count"]} for i in imm.values()), key=lambda e: -e["patients"]),
)

# ---------------------------------------------------------------- encounters
enc_classes = Counter()
enc_types = {}
enc_reasons = {}
for g in rows("encounters.csv"):
    cls = g("ENCOUNTERCLASS")
    enc_classes[cls] += 1
    code = g("CODE")
    t = enc_types.setdefault(code, {"code": code, "description": g("DESCRIPTION"), "count": 0, "classes": Counter()})
    t["count"] += 1
    t["classes"][cls] += 1
    rc = g("REASONCODE")
    if rc:
        r = enc_reasons.setdefault(rc, {"code": rc, "description": g("REASONDESCRIPTION"), "count": 0, "classes": Counter()})
        r["count"] += 1
        r["classes"][cls] += 1
dump(
    "encounters.json",
    {
        "classes": dict(enc_classes.most_common()),
        "types": [{**t, "classes": dict(t["classes"].most_common(4))} for t in sorted(enc_types.values(), key=lambda e: -e["count"])[:40]],
        "reasons": [{**r, "classes": dict(r["classes"].most_common(4))} for r in sorted(enc_reasons.values(), key=lambda e: -e["count"])[:60]],
    },
)

# ---------------------------------------------------------------- observations
CAP = 4000
obs = {}
for g in rows("observations.csv"):
    code = g("CODE")
    o = obs.get(code)
    if o is None:
        o = obs[code] = {"code": code, "description": g("DESCRIPTION"), "categories": Counter(), "units": Counter(), "types": Counter(), "count": 0, "num": [], "text": Counter()}
    o["count"] += 1
    o["categories"][g("CATEGORY")] += 1
    o["units"][g("UNITS")] += 1
    o["types"][g("TYPE")] += 1
    v = g("VALUE")
    if g("TYPE") == "numeric":
        try:
            x = float(v)
        except ValueError:
            continue
        if len(o["num"]) < CAP:
            o["num"].append(x)
        else:
            j = RNG.randrange(o["count"])
            if j < CAP:
                o["num"][j] = x
    else:
        if len(o["text"]) < 50 or v in o["text"]:
            o["text"][v] += 1

def pct(sorted_vals, p):
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(sorted_vals) - 1)
    return round(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo), 2)

observations = []
for o in obs.values():
    if o["count"] < 300:
        continue
    entry = {
        "code": o["code"],
        "system": "LOINC",
        "description": o["description"],
        "category": o["categories"].most_common(1)[0][0],
        "units": o["units"].most_common(1)[0][0],
        "type": o["types"].most_common(1)[0][0],
        "count": o["count"],
    }
    if o["num"]:
        s = sorted(o["num"])
        entry["numeric"] = {"p05": pct(s, 0.05), "p25": pct(s, 0.25), "p50": pct(s, 0.5), "p75": pct(s, 0.75), "p95": pct(s, 0.95), "mean": round(statistics.fmean(s), 2)}
    if o["text"]:
        entry["values"] = top(o["text"], 10)
    observations.append(entry)
observations.sort(key=lambda e: (e["category"], -e["count"]))
dump("observations.json", observations)

# ---------------------------------------------------------------- manifest
dump(
    "manifest.json",
    {
        "source": "Synthea v4.0.0 (synthea-with-dependencies.jar), Apache License 2.0, The MITRE Corporation",
        "generated_on": datetime.date.today().isoformat(),
        "generation_command": "java -jar synthea-with-dependencies.jar -p 1000 -a 65-140 --generate.only_alive_patients=true --exporter.csv.export=true --exporter.fhir.export=false Massachusetts",
        "source_rows": STATS,
        "patients": n_patients,
        "notes": [
            "Only aggregate vocabulary, co-occurrence counts, value distributions, and name pools were extracted. No patient records were copied.",
            "Numeric distributions for observations use reservoir samples of at most 4000 values per code.",
            "Conditions matching social-determinant patterns were moved to conditions-social-excluded.json.",
            "Names had Synthea's numeric suffixes stripped.",
        ],
    },
)
print(json.dumps({"patients": n_patients, "rows": STATS, "conditions": len(conditions), "medications": len(medications), "procedures": len(procedures), "allergies": len(allergies), "observations": len(observations)}, indent=1))
