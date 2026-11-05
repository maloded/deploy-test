// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allowedRequestTypes, DEFAULT_REQUEST_TYPE, isRequestType, needsSlots, REQUEST_TYPE_IDS, REQUEST_TYPES } from "@/lib/request-types";
import { productTypes } from "@/product-types";

describe("request types", () => {
  it("are viewing, testdrive, question and offer, with labels in every registry language", () => {
    expect(REQUEST_TYPE_IDS).toEqual(["viewing", "testdrive", "question", "offer"]);
    for (const r of Object.values(REQUEST_TYPES)) expect(Object.keys(r.label).sort()).toEqual(["bg", "de", "en", "tr"]);
    expect(DEFAULT_REQUEST_TYPE).toBe("question");
    expect(isRequestType("viewing")).toBe(true);
    expect(isRequestType("toString")).toBe(false);
    expect(isRequestType(1)).toBe(false);
  });

  it("only viewing and testdrive need slots", () => {
    expect(REQUEST_TYPE_IDS.filter(needsSlots)).toEqual(["viewing", "testdrive"]);
  });

  it("each product type lists its own (plain data in fields.ts), always with the default", () => {
    expect(productTypes.car.requestTypes).toEqual(["viewing", "testdrive", "question", "offer"]);
    expect(productTypes.house.requestTypes).toEqual(["viewing", "question", "offer"]);
    expect(productTypes.watch.requestTypes).toEqual(["viewing", "question", "offer"]);
    expect(productTypes.bag.requestTypes).toEqual(["viewing", "question", "offer"]);
    expect(productTypes.other.requestTypes).toEqual(["question", "offer"]);
    for (const [id, t] of Object.entries(productTypes)) {
      expect(t.requestTypes, id).toContain(DEFAULT_REQUEST_TYPE);
      for (const r of t.requestTypes) expect(isRequestType(r), `${id}: ${r}`).toBe(true);
      expect(new Set(t.requestTypes).size, id).toBe(t.requestTypes.length);
    }
  });

  it("without viewing settings the slot types are hidden, with them nothing is", () => {
    expect(allowedRequestTypes(productTypes.car.requestTypes, false)).toEqual(["question", "offer"]);
    expect(allowedRequestTypes(productTypes.car.requestTypes, true)).toEqual(["viewing", "testdrive", "question", "offer"]);
    expect(allowedRequestTypes(productTypes.other.requestTypes, false)).toEqual(["question", "offer"]);
  });
});

describe("the canonical id of a request type", () => {
  it("testdrive is canonical and test_drive is accepted as the same type; anything else is no type", async () => {
    const { canonicalRequestType, isRequestType, resolvePreset } = await import("@/lib/request-types");
    expect(canonicalRequestType("testdrive")).toBe("testdrive");
    expect(canonicalRequestType("test_drive")).toBe("testdrive");
    expect(canonicalRequestType("viewing")).toBe("viewing");
    for (const bad of ["", "TESTDRIVE", "test-drive", "toString", undefined, null, 3]) expect(canonicalRequestType(bad), String(bad)).toBeNull();
    expect(isRequestType("test_drive")).toBe(false); // the id of a type is the canonical one only
    expect(resolvePreset("test_drive", ["viewing", "testdrive", "question"])).toBe("testdrive"); // a button's data-request-type may still say it the old way
  });
});
