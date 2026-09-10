import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESIDENT_LIST_PARAMS,
  parseResidentListParams,
  residentListHref,
} from "./list-params";

const facilityId = "0d2a5c2e-8a53-5c0e-9f6b-3f6a1d1f9c11";

describe("parseResidentListParams", () => {
  it("defaults to current residents sorted by name on page one", () => {
    expect(parseResidentListParams({})).toEqual({
      q: "",
      facility: undefined,
      unit: undefined,
      status: "current",
      sort: "name",
      dir: "asc",
      page: 1,
    });
  });

  it("reads every supported parameter", () => {
    expect(
      parseResidentListParams({
        q: "  doe ",
        facility: facilityId,
        status: "former",
        sort: "room",
        dir: "desc",
        page: "3",
      }),
    ).toEqual({
      q: "doe",
      facility: facilityId,
      unit: undefined,
      status: "former",
      sort: "room",
      dir: "desc",
      page: 3,
    });
  });

  it("falls back to defaults for malformed values instead of failing", () => {
    const params = parseResidentListParams({
      facility: "not-a-uuid",
      unit: "",
      status: "everyone",
      sort: "height",
      dir: "sideways",
      page: "-4",
    });
    expect(params).toEqual(DEFAULT_RESIDENT_LIST_PARAMS);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseResidentListParams({ q: ["smith", "jones"] }).q).toBe("smith");
  });
});

describe("residentListHref", () => {
  it("omits defaults so the plain list has a plain URL", () => {
    expect(residentListHref(DEFAULT_RESIDENT_LIST_PARAMS)).toBe("/residents");
  });

  it("encodes the non-default state and applies overrides", () => {
    const href = residentListHref(
      { ...DEFAULT_RESIDENT_LIST_PARAMS, q: "mary o'neil", status: "all", page: 2 },
      { sort: "admission", dir: "desc" },
    );
    expect(href).toBe("/residents?q=mary+o%27neil&status=all&sort=admission&dir=desc&page=2");
  });
});
