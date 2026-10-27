// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allowedRequestTypes, DEFAULT_REQUEST_TYPE, isRequestType, needsSlots, REQUEST_TYPE_IDS, REQUEST_TYPES } from "@/lib/request-types";
import { productTypes } from "@/product-types";

describe("request types", () => {
  it("are viewing, test_drive, question and offer, with labels in every registry language", () => {
    expect(REQUEST_TYPE_IDS).toEqual(["viewing", "test_drive", "question", "offer"]);
    for (const r of Object.values(REQUEST_TYPES)) expect(Object.keys(r.label).sort()).toEqual(["de", "en"]);
    expect(DEFAULT_REQUEST_TYPE).toBe("question");
    expect(isRequestType("viewing")).toBe(true);
    expect(isRequestType("toString")).toBe(false);
    expect(isRequestType(1)).toBe(false);
  });

  it("only viewing and test_drive need slots", () => {
    expect(REQUEST_TYPE_IDS.filter(needsSlots)).toEqual(["viewing", "test_drive"]);
  });

  it("each product type lists its own (plain data in fields.ts), always with the default", () => {
    expect(productTypes.car.requestTypes).toEqual(["viewing", "test_drive", "question", "offer"]);
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
    expect(allowedRequestTypes(productTypes.car.requestTypes, true)).toEqual(["viewing", "test_drive", "question", "offer"]);
    expect(allowedRequestTypes(productTypes.other.requestTypes, false)).toEqual(["question", "offer"]);
  });
});
