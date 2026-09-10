import { describe, expect, it } from "vitest";

import { residentSearchTerms } from "./search";

describe("resident search terms", () => {
  it("drops honorifics, possessives, and filler so a spoken name matches the directory", () => {
    expect(residentSearchTerms("Mr. Doe")).toEqual(["doe"]);
    expect(residentSearchTerms("Mrs. Kowalski's")).toEqual(["kowalski"]);
    expect(residentSearchTerms("Harold Doe's")).toEqual(["harold", "doe"]);
    expect(residentSearchTerms("the resident in room 104")).toEqual(["104"]);
    expect(residentSearchTerms("Dr. Doe?")).toEqual(["doe"]);
  });

  it("keeps apostrophes inside a name and lowercases everything", () => {
    expect(residentSearchTerms("O'Brien")).toEqual(["o'brien"]);
    expect(residentSearchTerms("ROSE DELGADO")).toEqual(["rose", "delgado"]);
  });

  it("returns nothing for a query that is only filler", () => {
    expect(residentSearchTerms("Mr.")).toEqual([]);
    expect(residentSearchTerms("   ")).toEqual([]);
  });
});
