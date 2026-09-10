/**
 * The three demo logins. They are shown on the login page by design (spec, user story 2),
 * created by the seed, and used by the policy tests, so they live in one place.
 *
 * The password is intentionally simple: this is a demonstration on synthetic data.
 */

export const DEMO_PASSWORD = "willowbrook-demo";

export type DemoRole = "nurse" | "admin";

export type DemoAccount = {
  /** Stable key, also used by the seed to derive ids. */
  key: "nurse-meadows" | "nurse-harbor" | "admin";
  role: DemoRole;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  credentials: string | null;
  /** Facility code from the seed, or null for operator-wide staff. */
  facilityCode: string | null;
  /** Unit codes the nurse covers. Empty for the admin. */
  unitCodes: string[];
  /** What the login page says this account can see. */
  scopeLabel: string;
};

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    key: "nurse-meadows",
    role: "nurse",
    email: "maria.alvarez@willowbrook.example",
    password: DEMO_PASSWORD,
    firstName: "Maria",
    lastName: "Alvarez",
    credentials: "RN",
    facilityCode: "MDW",
    unitCodes: ["A", "B"],
    scopeLabel: "Nurse, Willowbrook Meadows, Units A and B",
  },
  {
    key: "nurse-harbor",
    role: "nurse",
    email: "daniel.okafor@willowbrook.example",
    password: DEMO_PASSWORD,
    firstName: "Daniel",
    lastName: "Okafor",
    credentials: "RN",
    facilityCode: "HBR",
    unitCodes: ["A", "B", "C"],
    scopeLabel: "Nurse, Willowbrook Harbor, Units A to C",
  },
  {
    key: "admin",
    role: "admin",
    email: "priya.natarajan@willowbrook.example",
    password: DEMO_PASSWORD,
    firstName: "Priya",
    lastName: "Natarajan",
    credentials: null,
    facilityCode: null,
    unitCodes: [],
    scopeLabel: "Admin, every facility",
  },
];
