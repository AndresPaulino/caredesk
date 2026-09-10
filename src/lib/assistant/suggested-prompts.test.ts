import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS } from "../demo-accounts";
import { HERO_BY_KEY } from "../seed/heroes";

import { SUGGESTED_PROMPTS } from "./suggested-prompts";

const meadowsNurse = DEMO_ACCOUNTS.find((account) => account.key === "nurse-meadows")!;

describe("the suggested prompts", () => {
  it("are four, each naming a hero resident on the Meadows nurse's units", () => {
    expect(SUGGESTED_PROMPTS).toHaveLength(4);
    for (const { hero: key, prompt } of SUGGESTED_PROMPTS) {
      const hero = HERO_BY_KEY.get(key)!;
      expect(hero, key).toBeDefined();
      expect(prompt, key).toContain(hero.lastName);
      expect(hero.facilityCode, key).toBe(meadowsNurse.facilityCode);
      expect(meadowsNurse.unitCodes, key).toContain(hero.unitCode);
    }
  });

  it("lead with the demo script's question about Mr. Doe", () => {
    expect(SUGGESTED_PROMPTS[0]).toEqual({
      hero: "doe-meadows",
      prompt: "When was Mr. Doe's last podiatry exam?",
    });
  });
});
