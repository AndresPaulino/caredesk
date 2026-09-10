import { describe, expect, it } from "vitest";

import { RECORD_TABS, parseRecordTab, residentHref } from "./record-tabs";

describe("record tabs", () => {
  it("has a tab for every record type the spec names, and the audit trail", () => {
    expect(RECORD_TABS.map((tab) => tab.key)).toEqual([
      "conditions",
      "medications",
      "vitals",
      "allergies",
      "labs",
      "care-plan",
      "incidents",
      "notes",
      "appointments",
      "family",
      "audit",
    ]);
  });

  it("parses the tab from the URL and falls back to the first tab", () => {
    expect(parseRecordTab("labs")).toBe("labs");
    expect(parseRecordTab("audit")).toBe("audit");
    expect(parseRecordTab(["family", "labs"])).toBe("family");
    expect(parseRecordTab("history")).toBe("conditions");
    expect(parseRecordTab(undefined)).toBe("conditions");
  });

  it("links to a resident, on a tab when one is given", () => {
    expect(residentHref("abc")).toBe("/residents/abc");
    expect(residentHref("abc", "medications")).toBe("/residents/abc?tab=medications");
  });
});
