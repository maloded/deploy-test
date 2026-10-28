// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a JSON object */
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ANYTIME, checkContactWindows, contactWindowsOf, DEFAULT_CONTACT_WINDOWS, isWindowCode, localStamp, sellerZone, windowLabel, zoneCity, zoneHint } from "@/lib/contact-windows";
import { readLeadContext } from "@/lib/lead-context";
import { LANGUAGES } from "@/lib/languages";
import { validateSeller } from "@/lib/seller";
import { EXAMPLES_DIR, examples } from "./helpers";

const issues = (raw: unknown) => {
  const r = validateSeller(raw);
  return r.ok ? [] : r.issues;
};
const seller = (): Record<string, any> => examples.sellerJson();
const tmp = path.join(process.cwd(), ".test-tmp", "contact-windows");
fs.rmSync(tmp, { recursive: true, force: true });
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("the default contact windows", () => {
  it("are anytime (first), morning, afternoon and evening with the agreed hours", () => {
    expect(DEFAULT_CONTACT_WINDOWS.map((w) => [w.code, w.from, w.to])).toEqual([
      ["anytime", undefined, undefined],
      ["morning", "09:00", "12:00"],
      ["afternoon", "12:00", "17:00"],
      ["evening", "17:00", "20:00"],
    ]);
    expect(checkContactWindows(DEFAULT_CONTACT_WINDOWS)).toEqual([]);
  });

  it("have a label in every registry language, and the labels of the timed windows include the hours", () => {
    for (const w of DEFAULT_CONTACT_WINDOWS) for (const lang of LANGUAGES) {
      expect(w.label[lang], `${w.code}.${lang}`).toBeTruthy();
      if (w.from) expect(w.label[lang], `${w.code}.${lang}`).toContain(`${w.from}–${w.to}`);
    }
    expect(windowLabel(DEFAULT_CONTACT_WINDOWS[0], "de")).toBe("Jederzeit");
    expect(windowLabel(DEFAULT_CONTACT_WINDOWS[0], "en")).toBe("Any time");
    expect(windowLabel(DEFAULT_CONTACT_WINDOWS[1], "de")).toBe("Vormittags (09:00–12:00)");
  });

  it("accept only their own codes", () => {
    expect(isWindowCode(DEFAULT_CONTACT_WINDOWS, "morning")).toBe(true);
    for (const code of ["night", "", undefined, 3, "Morning", "morning "]) expect(isWindowCode(DEFAULT_CONTACT_WINDOWS, code)).toBe(false);
  });
});

describe("the seller's override", () => {
  const OWN = [
    { code: "anytime", label: { en: "Whenever", de: "Wann immer" } },
    { code: "lunch", from: "12:00", to: "14:00", label: { en: "Lunch break (12:00–14:00)", de: "Mittagspause (12:00–14:00)" } },
  ];

  it("is valid when the codes are unique, from is before to and anytime is present; it replaces the defaults", () => {
    expect(issues({ ...seller(), contactWindows: OWN })).toEqual([]);
    expect(contactWindowsOf({ contactWindows: OWN }).map((w) => w.code)).toEqual(["anytime", "lunch"]);
  });

  it("falls back to the defaults without an override", () => {
    expect(contactWindowsOf({})).toEqual([...DEFAULT_CONTACT_WINDOWS]);
    expect(issues(seller())).toEqual([]);
  });

  it("without anytime is a validation error that names the field", () => {
    const list = issues({ ...seller(), contactWindows: [OWN[1]] });
    expect(list.join("\n")).toMatch(/contactWindows: .*"anytime" must be present/);
  });

  it.each([
    ["a duplicate code", [OWN[0], OWN[1], OWN[1]], /contactWindows\.2\.code: "lunch" is used twice/],
    ["from not before to", [OWN[0], { ...OWN[1], from: "14:00", to: "12:00" }], /contactWindows\.1: "from" must be before "to"/],
    ["from equal to", [OWN[0], { ...OWN[1], from: "12:00", to: "12:00" }], /"from" must be before "to"/],
    ["a window without hours", [OWN[0], { code: "lunch", label: OWN[1].label }], /contactWindows\.1: needs "from" and "to"/],
    ["a bad time", [OWN[0], { ...OWN[1], to: "25:00" }], /needs "from" and "to"/],
    ["a bad code", [OWN[0], { ...OWN[1], code: "Lunch Break" }], /contactWindows\.1\.code: must be lowercase/],
    ["hours on anytime", [{ ...OWN[0], from: "09:00", to: "10:00" }], /"anytime" has no hours/],
    ["a label in an unsupported language", [{ ...OWN[0], label: { xx: "?" } }], /unsupported|not supported|Supported languages/i],
    ["an empty list", [], /contactWindows/],
  ])("refuses %s", (_label, list, pattern) => {
    expect(issues({ ...seller(), contactWindows: list }).join("\n")).toMatch(pattern);
  });

  it("a label needs only the default language (the others fall back through the loader's rule)", () => {
    expect(issues({ ...seller(), contactWindows: [{ code: "anytime", label: { en: "Whenever" } }] })).toEqual([]);
    expect(windowLabel({ code: "anytime", label: { en: "Whenever" } }, "de", "en")).toBe("Whenever");
  });
});

describe("the time zone", () => {
  it("seller.json timezone is validated as an IANA name", () => {
    expect(issues({ ...seller(), timezone: "Europe/Paris" })).toEqual([]);
    expect(issues({ ...seller(), timezone: "Mars/Olympus" }).join("\n")).toMatch(/timezone: must be an IANA time zone/);
    expect(issues({ ...seller(), timezone: "not a zone" }).join("\n")).toMatch(/timezone:/);
  });

  it("the viewing zone wins, then the seller's own, else none", () => {
    expect(sellerZone("Europe/Vienna", "Europe/Paris")).toBe("Europe/Vienna");
    expect(sellerZone(undefined, "Europe/Paris")).toBe("Europe/Paris");
    expect(sellerZone(undefined, undefined)).toBeUndefined();
  });

  it("the hint is a whole sentence in the page language: a table for known zones, a generic sentence for others, nothing without a zone", () => {
    expect(zoneHint("Europe/Vienna", "en")).toBe("Times are in Vienna time.");
    expect(zoneHint("Europe/Vienna", "de")).toBe("Alle Zeiten in Wiener Zeit.");
    expect(zoneHint("Europe/Zurich", "de")).toBe("Alle Zeiten in Zürcher Zeit.");
    expect(zoneHint("Asia/Tokyo", "en")).toBe("Times are in the seller's local time.");
    expect(zoneHint("Asia/Tokyo", "de")).toBe("Alle Zeiten in Ortszeit des Verkäufers.");
    expect(zoneHint(undefined, "en")).toBeNull();
    expect(zoneHint(undefined, "de")).toBeNull();
  });

  it("the city comes from the table, else from the zone name; local stamps follow daylight saving", () => {
    expect(zoneCity("Europe/Vienna", "de")).toBe("Wien");
    expect(zoneCity("Europe/Vienna", "en")).toBe("Vienna");
    expect(zoneCity("America/New_York", "de")).toBe("New York");
    expect(localStamp("2026-06-10T10:05:00.000Z", "Europe/Vienna")).toBe("2026-06-10 12:05");
    expect(localStamp("2026-01-10T10:05:00.000Z", "Europe/Vienna")).toBe("2026-01-10 11:05");
    expect(localStamp("2026-06-10T23:30:00.000Z", "Europe/Vienna")).toBe("2026-06-11 01:30");
  });
});

describe("the lead context inlines the windows and the zone", () => {
  const rootWith = (name: string, edit: (s: Record<string, any>) => void) => {
    const root = path.join(tmp, name);
    fs.cpSync(EXAMPLES_DIR, root, { recursive: true });
    const file = path.join(root, "example-seller", "seller.json");
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    edit(s);
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    return { CONTENT_DIR: root, CONTENT_PRODUCT: examples.ref("example-watch") };
  };

  it("the defaults and the viewing zone", () => {
    const c = readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: examples.ref("example-house") });
    expect(c.contactWindows!.map((w) => w.code)).toEqual(["anytime", "morning", "afternoon", "evening"]);
    expect(c.timezone).toBe("Europe/Vienna");
  });

  it("the seller's own zone when there are no viewing settings; none when neither exists", () => {
    const own = readLeadContext(rootWith("own", (s) => { delete s.viewing; s.timezone = "Europe/Paris"; }));
    expect(own.timezone).toBe("Europe/Paris");
    const none = readLeadContext(rootWith("none", (s) => { delete s.viewing; delete s.timezone; }));
    expect(none.timezone).toBeUndefined();
    expect("timezone" in none).toBe(false);
  });

  it("the seller's override is inlined", () => {
    const c = readLeadContext(rootWith("override", (s) => { s.contactWindows = [{ code: "anytime", label: { en: "Whenever", de: "Wann immer" } }]; }));
    expect(c.contactWindows).toEqual([{ code: "anytime", label: { en: "Whenever", de: "Wann immer" } }]);
    expect(ANYTIME).toBe("anytime");
  });
});
