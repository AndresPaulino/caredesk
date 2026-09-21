import { describe } from "vitest";

import { hostedProjectSkipReason, missingHostedVariables, type HostedProjectNeeds } from "./env";

/**
 * `describe` for a suite that needs the hosted project. Without the variables it needs the
 * suite is skipped and its name says why, so a verbose report reads "skipped: ... not set"
 * rather than a silent pass; the test setup prints the same reason once at the top of the run.
 */
export function describeHosted(name: string, needs: HostedProjectNeeds, factory: () => void) {
  const missing = missingHostedVariables(needs);
  if (missing.length === 0) return describe(name, factory);
  return describe.skip(`${name} (skipped: ${hostedProjectSkipReason(missing)})`, factory);
}
