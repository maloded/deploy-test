// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  bookingWindow,
  checkViewing,
  instantOf,
  isTime,
  isTimeZone,
  isYmd,
  mergeViewing,
  missingViewingFields,
  slotProblem,
  slotsProblem,
  timeSlots,
  todayIn,
  weekdayOf,
  type ViewingConfig,
} from "@/lib/viewing";

const CONFIG: ViewingConfig = {
  address: { en: "Example Street 1 (fake)" },
  days: ["tue", "thu", "sat", "sun"],
  from: "10:00",
  to: "16:00",
  durationMinutes: 60,
  timezone: "Europe/Vienna",
};
const at = (iso: string) => new Date(iso);

afterEach(() => {
  vi.useRealTimers();
});

describe("formats", () => {
  it("times are HH:MM on a 24 hour clock", () => {
    for (const t of ["00:00", "09:30", "23:59"]) expect(isTime(t), t).toBe(true);
    for (const t of ["24:00", "9:30", "10:60", "10:00:00", "", 1000, null]) expect(isTime(t), String(t)).toBe(false);
  });

  it("time zones are IANA names the runtime knows", () => {
    for (const z of ["Europe/Vienna", "America/Argentina/Buenos_Aires", "UTC", "Asia/Kolkata"]) expect(isTimeZone(z), z).toBe(true);
    for (const z of ["Mars/Base", "", "Europe/", "CET+1 ", "Europe Vienna", 5, null]) expect(isTimeZone(z), String(z)).toBe(false);
  });

  it("dates are real calendar days", () => {
    expect(isYmd("2028-02-29")).toBe(true);
    for (const d of ["2027-02-29", "2026-13-01", "2026-1-1", "26-01-01", "", "2026-04-31"]) expect(isYmd(d), d).toBe(false);
  });
});

describe("checkViewing", () => {
  it("accepts a complete, sensible config and a single field", () => {
    expect(checkViewing(CONFIG)).toEqual([]);
    expect(checkViewing({ notes: { en: "x" } })).toEqual([]);
    expect(checkViewing({})).toEqual([]);
  });

  it("names every kind of problem", () => {
    expect(checkViewing({ from: "9:00" })).toEqual(['from: must be a time like "10:00"']);
    expect(checkViewing({ to: "25:00" })).toEqual(['to: must be a time like "17:00"']);
    expect(checkViewing({ from: "16:00", to: "10:00" })).toContain("from: must be before to");
    expect(checkViewing({ from: "10:00", to: "10:00" })).toContain("from: must be before to");
    expect(checkViewing({ durationMinutes: 9 })[0]).toMatch(/^durationMinutes: must be a whole number from 10 to 240/);
    expect(checkViewing({ durationMinutes: 241 })[0]).toMatch(/^durationMinutes/);
    expect(checkViewing({ durationMinutes: 30.5 })[0]).toMatch(/^durationMinutes/);
    expect(checkViewing({ durationMinutes: 10 })).toEqual([]);
    expect(checkViewing({ durationMinutes: 240 })).toEqual([]);
    expect(checkViewing({ timezone: "Mars/Base" })[0]).toMatch(/^timezone: must be an IANA time zone/);
    expect(checkViewing({ days: [] })).toContain("days: needs at least one day");
    expect(checkViewing({ days: ["mon", "mon"] })).toContain("days: each day may appear only once");
    expect(checkViewing({ days: ["mon", "funday" as never] })[0]).toMatch(/"funday" is not one of mon, tue/);
    expect(checkViewing({ from: "10:00", to: "10:30", durationMinutes: 60 })).toContain("durationMinutes: is longer than the time between from and to");
  });
});

describe("merging the seller's and the product's settings", () => {
  const seller = { ...CONFIG, notes: { en: "Seller notes" } };

  it("the product overrides field by field, the rest comes from the seller", () => {
    expect(mergeViewing(seller, { notes: { en: "Product notes" }, durationMinutes: 30 })).toEqual({ ...seller, notes: { en: "Product notes" }, durationMinutes: 30 });
  });

  it("a list or a text is replaced as a whole, not combined", () => {
    expect(mergeViewing(seller, { days: ["mon"] })!.days).toEqual(["mon"]);
    expect(mergeViewing(seller, { address: { de: "Nur Deutsch" } })!.address).toEqual({ de: "Nur Deutsch" });
  });

  it("works with only one side, and is undefined with neither", () => {
    expect(mergeViewing(seller, undefined)).toEqual(seller);
    expect(mergeViewing(undefined, seller)).toEqual(seller);
    expect(mergeViewing(undefined, undefined)).toBeUndefined();
    expect(mergeViewing(seller, { from: undefined })).toEqual(seller);
  });

  it("says which required fields are still missing", () => {
    expect(missingViewingFields(CONFIG)).toEqual([]);
    expect(missingViewingFields({ notes: { en: "x" } })).toEqual(["address", "days", "from", "to", "durationMinutes", "timezone"]);
    expect(missingViewingFields(mergeViewing({ days: ["mon"] }, { timezone: "UTC" })!)).toEqual(["address", "from", "to", "durationMinutes"]);
  });
});

describe("time slots of a day", () => {
  it("run from `from` in steps of the duration, as long as the visit ends by `to`", () => {
    expect(timeSlots(CONFIG)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
    expect(timeSlots({ from: "10:00", to: "16:00", durationMinutes: 90 })).toEqual(["10:00", "11:30", "13:00", "14:30"]);
    expect(timeSlots({ from: "10:00", to: "10:20", durationMinutes: 30 })).toEqual([]);
    expect(timeSlots({ from: "09:15", to: "10:15", durationMinutes: 20 })).toEqual(["09:15", "09:35", "09:55"]);
  });
});

describe("the seller's calendar", () => {
  it("adds days by the calendar, across months, years, leap days and daylight-saving changes", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // the 29th has 23 hours: still one day
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // the 25th has 25 hours
    expect(addDays("2026-03-01", 60)).toBe("2026-04-30");
    expect(addDays("2026-10-01", 60)).toBe("2026-11-30");
  });

  it("knows the weekday of a date", () => {
    expect(weekdayOf("2026-10-27")).toBe("tue");
    expect(weekdayOf("2026-03-29")).toBe("sun");
    expect(weekdayOf("2026-10-25")).toBe("sun");
    expect(weekdayOf("2026-11-01")).toBe("sun");
    expect(weekdayOf("2026-11-02")).toBe("mon");
  });

  it("finds the instant of a local time, also around the clock changes (the last Sundays of March and October)", () => {
    expect(new Date(instantOf("2026-07-01", "10:00", "Europe/Vienna")!).toISOString()).toBe("2026-07-01T08:00:00.000Z"); // CEST, UTC+2
    expect(new Date(instantOf("2026-01-15", "10:00", "Europe/Vienna")!).toISOString()).toBe("2026-01-15T09:00:00.000Z"); // CET, UTC+1
    // 2026-03-29: at 02:00 the clocks go to 03:00, so 02:30 does not exist
    expect(instantOf("2026-03-29", "02:30", "Europe/Vienna")).toBeNull();
    expect(new Date(instantOf("2026-03-29", "01:30", "Europe/Vienna")!).toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(new Date(instantOf("2026-03-29", "03:00", "Europe/Vienna")!).toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(new Date(instantOf("2026-03-29", "10:00", "Europe/Vienna")!).toISOString()).toBe("2026-03-29T08:00:00.000Z"); // already CEST
    // 2026-10-25: at 03:00 the clocks go back to 02:00, so 02:30 exists twice (the later one is used)
    expect(new Date(instantOf("2026-10-25", "02:30", "Europe/Vienna")!).toISOString()).toBe("2026-10-25T01:30:00.000Z");
    expect(new Date(instantOf("2026-10-25", "10:00", "Europe/Vienna")!).toISOString()).toBe("2026-10-25T09:00:00.000Z"); // CET again
  });

  it("today, tomorrow and the horizon are the SELLER's calendar days (Europe/Vienna), not the visitor's or the server's", () => {
    vi.useFakeTimers();
    const window = (iso: string, tz = "Europe/Vienna") => {
      vi.setSystemTime(at(iso));
      return bookingWindow({ timezone: tz });
    };
    // summer: Vienna is UTC+2, local midnight is 22:00 UTC
    expect(window("2026-06-10T21:59:00Z")).toEqual({ min: "2026-06-11", max: "2026-08-09" }); // 23:59 on the 10th
    expect(window("2026-06-10T22:01:00Z")).toEqual({ min: "2026-06-12", max: "2026-08-10" }); // 00:01 on the 11th
    // winter: UTC+1, midnight is 23:00 UTC
    expect(window("2026-12-10T22:59:00Z")).toEqual({ min: "2026-12-11", max: "2027-02-08" });
    expect(window("2026-12-10T23:01:00Z")).toEqual({ min: "2026-12-12", max: "2027-02-09" });
    // the same instant is a different day somewhere else: the seller's zone decides, whatever the machine's zone is
    expect(todayIn("Pacific/Auckland", at("2026-06-10T21:59:00Z"))).toBe("2026-06-11");
    expect(todayIn("America/Los_Angeles", at("2026-06-10T21:59:00Z"))).toBe("2026-06-10");
    const machine = process.env.TZ;
    try {
      for (const tz of ["Pacific/Auckland", "America/Los_Angeles", "UTC"]) {
        process.env.TZ = tz;
        expect(window("2026-06-10T21:59:00Z").min, `machine in ${tz}`).toBe("2026-06-11");
        expect(window("2026-06-10T22:01:00Z").min, `machine in ${tz}`).toBe("2026-06-12");
      }
    } finally {
      if (machine === undefined) delete process.env.TZ;
      else process.env.TZ = machine;
    }
  });

  it("the horizon is 60 calendar days even over a clock change", () => {
    expect(bookingWindow(CONFIG, at("2026-03-01T12:00:00Z"))).toEqual({ min: "2026-03-02", max: "2026-04-30" });
    expect(bookingWindow(CONFIG, at("2026-10-01T12:00:00Z"))).toEqual({ min: "2026-10-02", max: "2026-11-30" });
  });
});

describe("one slot", () => {
  const now = at("2026-06-10T10:00:00Z"); // Wednesday 12:00 in Vienna
  const p = (date: string, time: string, config = CONFIG) => slotProblem({ date, time }, config, now);

  it("accepts an allowed day, a listed time, tomorrow or later, and up to the horizon", () => {
    expect(p("2026-06-11", "10:00")).toBeNull(); // Thursday, tomorrow
    expect(p("2026-06-13", "15:00")).toBeNull(); // Saturday, the last start of the day
    expect(p("2026-08-09", "10:00")).toBeNull(); // Sunday, the last day of the horizon
  });

  it("rejects today and the past, and anything beyond the horizon", () => {
    expect(p("2026-06-10", "15:00")).toBe("past");
    expect(p("2026-06-09", "10:00")).toBe("past");
    expect(p("2026-08-10", "10:00")).toBe("horizon");
    expect(p("2027-01-01", "10:00")).toBe("horizon");
  });

  it("rejects a day that is not allowed, and a time outside the hours or not on the grid", () => {
    expect(p("2026-06-12", "10:00")).toBe("day"); // Friday
    expect(p("2026-06-11", "09:00")).toBe("time");
    expect(p("2026-06-11", "16:00")).toBe("time"); // the visit would end at 17:00
    expect(p("2026-06-11", "10:30")).toBe("time");
    expect(p("2026-06-11", "23:00")).toBe("time");
  });

  it("rejects malformed slots", () => {
    for (const slot of [null, "2026-06-11 10:00", {}, { date: "2026-06-11" }, { date: "11.06.2026", time: "10:00" }, { date: "2026-02-30", time: "10:00" }, { date: "2026-06-11", time: "10h" }, { date: 20260611, time: "10:00" }]) {
      expect(slotProblem(slot, CONFIG, now), JSON.stringify(slot)).toBe("format");
    }
  });

  it("on the last Sunday of March a time inside the skipped hour does not exist, other times are fine", () => {
    const wide = { ...CONFIG, from: "00:00", to: "06:00", durationMinutes: 30 };
    const early = at("2026-03-20T10:00:00Z");
    expect(slotProblem({ date: "2026-03-29", time: "01:30" }, wide, early)).toBeNull();
    expect(slotProblem({ date: "2026-03-29", time: "02:00" }, wide, early)).toBe("nonexistent");
    expect(slotProblem({ date: "2026-03-29", time: "02:30" }, wide, early)).toBe("nonexistent");
    expect(slotProblem({ date: "2026-03-29", time: "03:00" }, wide, early)).toBeNull();
    expect(slotProblem({ date: "2026-03-29", time: "10:00" }, CONFIG, early)).toBeNull(); // Sunday, normal hours
  });

  it("on the last Sunday of October the repeated hour is accepted, and the horizon does not lose or gain a day", () => {
    const wide = { ...CONFIG, from: "00:00", to: "06:00", durationMinutes: 30 };
    const early = at("2026-10-20T10:00:00Z");
    expect(slotProblem({ date: "2026-10-25", time: "02:30" }, wide, early)).toBeNull();
    expect(slotProblem({ date: "2026-10-25", time: "10:00" }, CONFIG, early)).toBeNull();
    // from 2026-10-24 (Saturday) the horizon ends on 2026-12-23, passing the change on the 25th
    const sat = at("2026-10-24T10:00:00Z");
    expect(bookingWindow(CONFIG, sat).max).toBe("2026-12-23");
    expect(slotProblem({ date: "2026-12-23", time: "10:00" }, { ...CONFIG, days: ["wed"] }, sat)).toBeNull();
    expect(slotProblem({ date: "2026-12-24", time: "10:00" }, { ...CONFIG, days: ["thu"] }, sat)).toBe("horizon");
  });

  it("tomorrow follows the seller's midnight: just before it a slot for the next day is fine, just after it that day is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at("2026-06-10T21:59:00Z")); // 23:59 Wed 10 June in Vienna
    expect(slotProblem({ date: "2026-06-11", time: "10:00" }, CONFIG)).toBeNull();
    vi.setSystemTime(at("2026-06-10T22:01:00Z")); // 00:01 Thu 11 June in Vienna
    expect(slotProblem({ date: "2026-06-11", time: "10:00" }, CONFIG)).toBe("past");
    expect(slotProblem({ date: "2026-06-13", time: "10:00" }, CONFIG)).toBeNull();
  });
});

describe("a list of slots", () => {
  const now = at("2026-06-10T10:00:00Z");
  const one = { date: "2026-06-11", time: "10:00" };
  const two = { date: "2026-06-13", time: "11:00" };
  const three = { date: "2026-06-14", time: "12:00" };

  it("needs 1 to 3 slots, all acceptable, no repeats", () => {
    expect(slotsProblem([one], CONFIG, now)).toBeNull();
    expect(slotsProblem([one, two, three], CONFIG, now)).toBeNull();
    expect(slotsProblem([], CONFIG, now)).toBe("count");
    expect(slotsProblem([one, two, three, { date: "2026-06-16", time: "10:00" }], CONFIG, now)).toBe("count");
    expect(slotsProblem(undefined, CONFIG, now)).toBe("count");
    expect(slotsProblem("x", CONFIG, now)).toBe("count");
    expect(slotsProblem([one, one], CONFIG, now)).toBe("duplicate");
    expect(slotsProblem([one, { date: "2026-06-12", time: "10:00" }], CONFIG, now)).toBe("day");
  });
});
