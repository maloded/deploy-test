// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLead } from "@/lib/lead-handler";
import { readLeadContext } from "@/lib/lead-context";
import { buildRecord, leadRecordSchema, type LeadRecord } from "@/lib/leads";
import { leadLimiter } from "@/lib/rate-limit";
import { MIN_FILL_MS, validateLead } from "@/lib/lead";
import { EXAMPLES_DIR, examples } from "./helpers";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lead-viewing-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const HOUSE = examples.ref("example-house"); // fake viewing settings: Tue, Thu, Sat, 10:00 to 16:00 in one-hour visits, Europe/Vienna
const WATCH = examples.ref("example-watch"); // none
let n = 0;
const env = (extra: Record<string, string> = {}) => ({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE, LEADS_STORE: "file", LEADS_DIR: path.join(tmp, `l${n++}`), ...extra });
const stored = (e: Record<string, string>) => (fs.existsSync(e.LEADS_DIR) ? fs.readdirSync(e.LEADS_DIR) : []);

const BASE = { lang: "en", requestType: "viewing", name: "Test Person", email: "person@example.invalid", consent: true, website: "", elapsedMs: MIN_FILL_MS + 500 };
let ip = 0;
const post = (body: unknown, e = env(), fetchImpl?: typeof fetch) =>
  handleLead(
    new Request("http://localhost:3000/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lead-request": "1", host: "localhost:3000", "x-forwarded-for": `198.51.100.${(ip++ % 250) + 1}` },
      body: JSON.stringify(body),
    }),
    e,
    fetchImpl,
  );
const GENERIC = { ok: false, error: "invalid", errors: { preferredSlots: "invalid" } };

// Wednesday 10 June 2026, 12:00 in Vienna. Only Date is faked: the file system and promises run normally.
beforeEach(() => {
  leadLimiter.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("the lead context carries the viewing settings", () => {
  it("merged from the seller and the product: the house has them, the watch has none", () => {
    expect(readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE }).viewing).toMatchObject({ days: ["tue", "thu", "sat"], from: "10:00", to: "16:00", durationMinutes: 60, timezone: "Europe/Vienna" });
    expect(readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: WATCH }).viewing).toBeNull();
  });

  it("offers viewing only where there are settings", () => {
    expect(readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE }).requestTypes).toEqual(["viewing", "question", "offer"]);
    expect(readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: WATCH }).requestTypes).toEqual(["question", "offer"]);
  });
});

describe("a viewing request", () => {
  const slots = [{ date: "2026-06-11", time: "10:00" }, { date: "2026-06-13", time: "15:00" }];

  it("is stored with its type and its seller-local slots", async () => {
    const e = env();
    const res = await post({ ...BASE, preferredSlots: slots }, e);
    expect(res.status).toBe(200);
    const [name] = stored(e);
    const record = JSON.parse(fs.readFileSync(path.join(e.LEADS_DIR, name), "utf8")) as LeadRecord;
    expect(record).toMatchObject({ requestType: "viewing", product: HOUSE, source: "form", preferredSlots: slots });
    expect(leadRecordSchema.safeParse(record).success).toBe(true);
    expect(Object.keys(record.preferredSlots![0]).sort()).toEqual(["date", "time"]);
  });

  it("travels with the webhook payload", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const res = await post({ ...BASE, preferredSlots: slots }, env({ LEADS_STORE: "webhook", LEADS_WEBHOOK_URL: "https://hooks.example/x" }), f as unknown as typeof fetch);
    expect(res.status).toBe(200);
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [URL, RequestInit])[1].body)) as LeadRecord;
    expect(sent).toMatchObject({ requestType: "viewing", preferredSlots: slots });
    expect(leadRecordSchema.safeParse(sent).success).toBe(true);
  });

  it("accepts one, two or three slots", async () => {
    for (const count of [1, 2, 3]) {
      const e = env();
      expect((await post({ ...BASE, preferredSlots: [...slots, { date: "2026-06-16", time: "12:00" }].slice(0, count) }, e)).status, String(count)).toBe(200);
      expect(stored(e)).toHaveLength(1);
    }
  });

  it.each([
    ["no slot", undefined],
    ["an empty list", []],
    ["four slots", [...slots, { date: "2026-06-16", time: "12:00" }, { date: "2026-06-18", time: "12:00" }]],
    ["the same slot twice", [slots[0], slots[0]]],
    ["today", [{ date: "2026-06-10", time: "15:00" }]], // a Wednesday: not an allowed day either, and not tomorrow
    ["a day that is not allowed (Friday)", [{ date: "2026-06-12", time: "10:00" }]],
    ["a time before the hours", [{ date: "2026-06-11", time: "09:00" }]],
    ["a visit that would end after the hours", [{ date: "2026-06-11", time: "16:00" }]],
    ["a time off the grid", [{ date: "2026-06-11", time: "10:30" }]],
    ["a day beyond the 60-day horizon", [{ date: "2026-08-11", time: "10:00" }]], // Tuesday, 62 days ahead
    ["a date that does not exist", [{ date: "2026-02-30", time: "10:00" }]],
    ["a malformed time", [{ date: "2026-06-11", time: "ten" }]],
    ["an extra key in a slot", [{ date: "2026-06-11", time: "10:00", note: "x" }]],
  ])("refuses %s with one generic answer and stores nothing", async (_label, preferredSlots) => {
    const e = env();
    const res = await post({ ...BASE, ...(preferredSlots === undefined ? {} : { preferredSlots }) }, e);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "invalid" });
    expect(JSON.stringify(body)).not.toMatch(/2026|10:00|day|time|past|horizon/i); // nothing about the slot or the reason
    expect(stored(e)).toEqual([]);
  });

  it("the answer for a refused slot is the same whatever was wrong", async () => {
    const answers = new Set<string>();
    for (const slot of [{ date: "2026-06-12", time: "10:00" }, { date: "2026-06-11", time: "09:00" }, { date: "2026-12-01", time: "10:00" }, { date: "2026-06-10", time: "10:00" }]) {
      answers.add(JSON.stringify(await (await post({ ...BASE, preferredSlots: [slot] })).json()));
    }
    expect([...answers]).toEqual([JSON.stringify(GENERIC)]);
  });

  it("follows the seller's midnight: tomorrow's slot is fine at 23:59 in Vienna and refused at 00:01", async () => {
    const tomorrow = [{ date: "2026-06-11", time: "10:00" }];
    vi.setSystemTime(new Date("2026-06-10T21:59:00Z")); // 23:59 on the 10th in Vienna
    expect((await post({ ...BASE, preferredSlots: tomorrow })).status).toBe(200);
    vi.setSystemTime(new Date("2026-06-10T22:01:00Z")); // 00:01 on the 11th: that day is now today
    expect((await post({ ...BASE, preferredSlots: tomorrow })).status).toBe(400);
  });

  it("refuses slots on a type that takes none, and a slot type the product does not offer", async () => {
    expect((await post({ ...BASE, requestType: "question", preferredSlots: slots })).status).toBe(400);
    expect((await post({ ...BASE, requestType: "test_drive", preferredSlots: slots })).status).toBe(400); // a house has no test drive
    const watch = env({ CONTENT_PRODUCT: WATCH });
    const res = await post({ ...BASE, preferredSlots: slots }, watch); // the watch has no viewing settings
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid", errors: { requestType: "invalid" } });
    expect(stored(watch)).toEqual([]);
  });

  it("a request without slots is still fine for the other types", async () => {
    for (const requestType of ["question", "offer"]) expect((await post({ ...BASE, requestType })).status, requestType).toBe(200);
  });
});

describe("daylight saving in the server's check", () => {
  /** A site whose viewing hours include the night, on every day, so the clock changes can be hit. */
  const nightRoot = () => {
    const root = path.join(tmp, `night${n++}`);
    const seller = path.join(root, "example-seller");
    fs.mkdirSync(path.join(seller, "example-house"), { recursive: true });
    fs.copyFileSync(path.join(EXAMPLES_DIR, "example-seller", "seller.json"), path.join(seller, "seller.json"));
    const product = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, "example-seller", "example-house", "product.json"), "utf8"));
    product.viewing = { ...product.viewing, days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], from: "00:00", to: "06:00", durationMinutes: 30 };
    fs.writeFileSync(path.join(seller, "example-house", "product.json"), JSON.stringify(product));
    return env({ CONTENT_DIR: root });
  };

  it("the last Sunday of March: the skipped hour (02:00 to 03:00) is refused, the hours around it are accepted", async () => {
    vi.setSystemTime(new Date("2026-03-20T10:00:00Z"));
    const e = nightRoot();
    const at = (time: string) => post({ ...BASE, preferredSlots: [{ date: "2026-03-29", time }] }, e);
    expect((await at("01:30")).status).toBe(200);
    expect((await at("02:00")).status).toBe(400);
    expect((await at("02:30")).status).toBe(400);
    expect((await at("03:00")).status).toBe(200);
  });

  it("the last Sunday of October: the repeated hour (02:00 to 03:00) is accepted", async () => {
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    const e = nightRoot();
    for (const time of ["01:30", "02:00", "02:30", "03:00"]) expect((await post({ ...BASE, preferredSlots: [{ date: "2026-10-25", time }] }, e)).status, time).toBe(200);
  });
});

describe("the lead record schema", () => {
  it("accepts a record built from a validated viewing request, and rejects an agent source or a stray field", () => {
    const checked = validateLead({ ...BASE, preferredSlots: [{ date: "2026-06-11", time: "10:00" }] });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const context = readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE });
    const record = buildRecord(checked.data, context, "UA");
    expect(leadRecordSchema.safeParse(record).success).toBe(true);
    expect(leadRecordSchema.safeParse({ ...record, source: "agent" }).success).toBe(false);
    expect(leadRecordSchema.safeParse({ ...record, ip: "203.0.113.1" }).success).toBe(false);
  });

  it("validates the sample record in PROJECT.md (fake data)", () => {
    const text = fs.readFileSync("PROJECT.md", "utf8");
    const block = /<!-- sample-lead-record:start -->\s*```json\n([\s\S]*?)```\s*<!-- sample-lead-record:end -->/.exec(text);
    expect(block, "the sample record markers are missing in PROJECT.md").toBeTruthy();
    const sample = JSON.parse(block![1]);
    const parsed = leadRecordSchema.safeParse(sample);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(sample.requestType).toBe("viewing");
    expect(sample.preferredSlots.length).toBeGreaterThan(0);
    expect(sample.email).toMatch(/\.invalid$/);
  });
});

describe("one answer lists every blocking field (the slot requirement is not hidden by other errors)", () => {
  it("validateLead: name missing and no slots give both in one answer", () => {
    const r = validateLead({ ...BASE, name: "", preferredSlots: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors).toEqual({ name: "required", preferredSlots: "required" });
  });

  it("validateLead: a type that takes no slots, with another field failing, still reports the slots as invalid", () => {
    const r = validateLead({ ...BASE, requestType: "question", name: "", preferredSlots: [{ date: "2026-06-16", time: "10:00" }] });
    expect(!r.ok && r.errors).toEqual({ name: "required", preferredSlots: "invalid" });
  });

  it("validateLead: a slot error that the schema itself found is not overwritten", () => {
    const r = validateLead({ ...BASE, name: "", preferredSlots: [{ date: "2026-06-16", time: "10:00", extra: 1 }] });
    expect(!r.ok && r.errors).toMatchObject({ name: "required", preferredSlots: expect.any(String) });
  });

  it("the lead API answers 400 with both fields", async () => {
    const e = env();
    const res = await post({ ...BASE, name: "", preferredSlots: [] }, e);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, errors: { name: "required", preferredSlots: "required" } });
    expect(stored(e)).toEqual([]);
  });
});
