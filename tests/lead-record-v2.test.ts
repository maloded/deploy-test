// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLead } from "@/lib/lead-handler";
import { MIN_FILL_MS } from "@/lib/lead";
import { readLeadContext } from "@/lib/lead-context";
import { LEAD_SCHEMA_VERSION, leadRecordSchema, markNotified, type LeadRecord } from "@/lib/leads";
import { amountProblem, DEFAULT_MAX_SHARE, DEFAULT_MIN_SHARE, offerBounds, parseAmount } from "@/lib/offer-amount";
import { leadLimiter } from "@/lib/rate-limit";
import { validateProduct } from "@/lib/validate";
import { validateSeller } from "@/lib/seller";
import { EXAMPLES_DIR, FIXTURE_DIR, examples, fixtures } from "./helpers";
import { FAKE_CHAT, FAKE_TOKEN } from "./telegram-fakes";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lead-v2-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const CAR = `${fixtures.seller}/fixture-car`; // costs 589 (EUR): offers from 295 to 1,767; question and offer only
const HOUSE = examples.ref("example-house"); // costs 890,000: viewing too (Tue, Thu, Sat, 10:00 to 16:00, Vienna)
let n = 0;
const env = (extra: Record<string, string> = {}) => ({ CONTENT_DIR: FIXTURE_DIR, CONTENT_PRODUCT: CAR, LEADS_STORE: "file", LEADS_DIR: path.join(tmp, `l${n++}`), ...extra });
const house = (extra: Record<string, string> = {}) => env({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE, ...extra });
const stored = (e: Record<string, string>): LeadRecord[] => (fs.existsSync(e.LEADS_DIR) ? fs.readdirSync(e.LEADS_DIR).map((f) => JSON.parse(fs.readFileSync(path.join(e.LEADS_DIR, f), "utf8"))) : []);
const BASE = { lang: "en", name: "Test Person", email: "person@example.invalid", consent: true, website: "", elapsedMs: MIN_FILL_MS + 500 };
const OFFER = { ...BASE, requestType: "offer", phone: "+00 000 000 000" };
let ip = 0;
const post = (body: unknown, e: Record<string, string>, fetchImpl?: typeof fetch) =>
  handleLead(new Request("http://localhost:3000/api/lead", { method: "POST", headers: { "content-type": "application/json", "x-lead-request": "1", host: "localhost:3000", "x-forwarded-for": `198.51.100.${(ip++ % 250) + 1}` }, body: JSON.stringify(body) }), e, fetchImpl);

beforeEach(() => leadLimiter.reset());
afterEach(() => vi.useRealTimers());

describe("the amount of an offer (offer-amount.ts)", () => {
  it("reads '50.000' as fifty thousand, '49500,5' as 49,500.50, and refuses what is not a number", () => {
    expect([parseAmount("50.000"), parseAmount("49500,5"), parseAmount("50 000"), parseAmount("50000"), parseAmount(" 7 "), parseAmount(50000)]).toEqual([50000, 49500.5, 50000, 50000, 7, 50000]);
    for (const bad of ["", "  ", "abc", "5o", "1,2,3", "-5", "1e5", "0x10", null, undefined, {}]) expect(parseAmount(bad), String(bad)).toBeNaN();
  });

  it("the range is the product's own, one end or both, else half to three times the price", () => {
    expect(DEFAULT_MIN_SHARE).toBe(0.5);
    expect(DEFAULT_MAX_SHARE).toBe(3);
    expect(offerBounds(53900)).toEqual({ min: 26950, max: 161700 });
    expect(offerBounds(53900, { min: 30000, max: 200000 })).toEqual({ min: 30000, max: 200000 });
    expect(offerBounds(53900, { max: 100000 })).toEqual({ min: 26950, max: 100000 });
    expect(offerBounds(53900, { min: 40000 })).toEqual({ min: 40000, max: 161700 });
    expect(offerBounds(0)).toBeNull(); // a price of 0 gives nothing to go by
    expect(offerBounds(0, { min: 1, max: 10 })).toEqual({ min: 1, max: 10 });
    expect(offerBounds(100, { min: 500 })).toBeNull(); // an own minimum above the default maximum leaves no range
  });

  it("amountProblem: invalid for what is not a positive number, range outside the bounds, null inside (and the edges are inside)", () => {
    const b = { min: 100, max: 200 };
    expect([amountProblem(NaN, b), amountProblem(0, b), amountProblem(-1, b), amountProblem(99.99, b), amountProblem(200.01, b), amountProblem(100, b), amountProblem(200, b)]).toEqual(["invalid", "invalid", "invalid", "range", "range", null, null]);
    expect(amountProblem(5, null)).toBeNull(); // no range to check: any positive number
  });
});

describe("the API checks the amount against the product's range", () => {
  it("the fixture car (589): 295 to 1,767, edges included; outside is a 400 that names the amount and stores nothing", async () => {
    const e = env();
    for (const amount of [800, "295", 1767, "1.000"]) expect((await post({ ...OFFER, amount }, e)).status, String(amount)).toBe(200);
    expect(stored(e)).toHaveLength(4);
    for (const amount of [5, 294, 1768, "2.000.000"]) {
      const res = await post({ ...OFFER, amount }, e);
      expect(res.status, String(amount)).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "invalid", errors: { amount: "amount" } });
    }
    expect(stored(e)).toHaveLength(4);
  });

  it("stores the amount as a number with the currency of the price, only for an offer", async () => {
    const e = env();
    await post({ ...OFFER, amount: "800,5" }, e);
    await post({ ...BASE, requestType: "question", message: "Hello" }, e);
    const offer = stored(e).find((r) => r.type === "offer")!;
    const question = stored(e).find((r) => r.type === "question")!;
    expect(offer).toMatchObject({ type: "offer", amount: 800.5, currency: "EUR" });
    expect(question).not.toHaveProperty("amount");
    expect(question).not.toHaveProperty("currency");
  });

  it("a product's own range (offerAmount in product.json) wins over the default", async () => {
    const root = path.join(tmp, "own-range");
    fs.cpSync(FIXTURE_DIR, root, { recursive: true });
    const file = path.join(root, fixtures.seller, "fixture-car", "product.json");
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), offerAmount: { min: 100, max: 700 } }));
    const e = env({ CONTENT_DIR: root });
    expect(readLeadContext(e).offer).toEqual({ min: 100, max: 700 });
    expect((await post({ ...OFFER, amount: 100 }, e)).status).toBe(200);
    expect((await post({ ...OFFER, amount: 700 }, e)).status).toBe(200);
    expect((await post({ ...OFFER, amount: 800 }, e)).status).toBe(400); // inside the default range, outside this product's
    expect((await post({ ...OFFER, amount: 99 }, e)).status).toBe(400);
  });

  it("the lead context carries the range, the currency and the seller's consent version (unversioned without one)", () => {
    const context = readLeadContext(env());
    expect(context).toMatchObject({ currency: "EUR", offer: { min: 295, max: 1767 }, consentVersion: "unversioned" });
    expect(readLeadContext(house()).offer).toEqual({ min: 445000, max: 2670000 });
  });
});

describe("a request from the agent", () => {
  it("an offer without an amount is stored with the currency and no amount; with an amount the range still applies", async () => {
    const e = env();
    expect((await post({ ...OFFER, source: "agent" }, e)).status).toBe(200);
    expect((await post({ ...OFFER, source: "agent", amount: 5 }, e)).status).toBe(400);
    const [record] = stored(e);
    expect(record).toMatchObject({ type: "offer", source: "agent", currency: "EUR" });
    expect(record).not.toHaveProperty("amount");
    expect(leadRecordSchema.safeParse(record).success).toBe(true);
  });

  it("a viewing without slots is stored without them; the slots it has are checked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
    const e = house();
    expect((await post({ ...BASE, requestType: "viewing", source: "agent" }, e)).status).toBe(200);
    expect((await post({ ...BASE, requestType: "viewing", source: "agent", preferredSlots: [{ date: "2026-06-12", time: "10:00" }] }, e)).status).toBe(400); // a Friday: no visits
    expect((await post({ ...BASE, requestType: "viewing" }, e)).status).toBe(400); // the web form needs one
    const [record] = stored(e);
    expect(record).toMatchObject({ type: "viewing", source: "agent" });
    expect(record).not.toHaveProperty("slots");
  });

  it("name, contact and consent are still needed", async () => {
    const e = env();
    for (const body of [{ name: "" }, { email: undefined }, { consent: false }]) expect((await post({ ...BASE, requestType: "question", source: "agent", ...body }, e)).status, JSON.stringify(body)).toBe(400);
    expect(stored(e)).toEqual([]);
  });
});

describe("the slots of the record", () => {
  it("carry the instant as ISO 8601 with the zone's offset: +01:00 in winter, +02:00 in summer", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const e = house();
    // Tue 6 Jan 10:00 and, 60 days is the horizon: Tue 3 Mar 2026 is still winter time
    expect((await post({ ...BASE, requestType: "viewing", preferredSlots: [{ date: "2026-01-06", time: "10:00" }, { date: "2026-02-28", time: "15:00" }] }, e)).status).toBe(200);
    vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
    expect((await post({ ...BASE, requestType: "viewing", preferredSlots: [{ date: "2026-06-11", time: "10:00" }] }, e)).status).toBe(200);
    const slots = stored(e).flatMap((r) => r.slots!);
    expect(slots.map((s) => s.start).sort()).toEqual(["2026-01-06T10:00:00+01:00", "2026-02-28T15:00:00+01:00", "2026-06-11T10:00:00+02:00"]);
    for (const s of slots) expect(new Date(s.start).toISOString().slice(11, 16)).not.toBe(s.time); // the offset moved it to UTC
  });
});

describe("the record is a contract: version, ids, delivery", () => {
  it("has the version, the request number, the two ids and the delivery of a file store", async () => {
    const e = env({ LEADS_STORE: "file" });
    const res = await post({ ...BASE, requestType: "question", message: "Hi" }, e);
    const [record] = stored(e);
    expect(record.schemaVersion).toBe(LEAD_SCHEMA_VERSION);
    expect(LEAD_SCHEMA_VERSION).toBe(2);
    expect(((await res.json()) as { id: string }).id).toBe(record.requestNumber);
    expect(record).toMatchObject({ seller: fixtures.seller, product: "fixture-car", delivery: { stored: true, store: "file", notified: false } });
    expect(Object.keys(record)).not.toContain("receivedAt");
  });

  it("the schema needs a phone number or an e-mail address, the current version, and a canonical type", async () => {
    const e = env();
    await post({ ...BASE, requestType: "question", message: "Hi" }, e);
    const [record] = stored(e);
    expect(leadRecordSchema.safeParse(record).success).toBe(true);
    expect(leadRecordSchema.safeParse({ ...record, email: undefined }).success).toBe(false);
    expect(leadRecordSchema.safeParse({ ...record, email: undefined, phone: "+00 000 000 000" }).success).toBe(true);
    expect(leadRecordSchema.safeParse({ ...record, schemaVersion: 1 }).success).toBe(false);
    expect(leadRecordSchema.safeParse({ ...record, type: "test_drive" }).success).toBe(false);
    expect(leadRecordSchema.safeParse({ ...record, delivery: { stored: false, store: "file", notified: false } }).success).toBe(false);
    expect(leadRecordSchema.safeParse({ ...record, delivery: undefined }).success).toBe(false);
  });

  it("the old test_drive on input is stored as testdrive", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
    const root = path.join(tmp, "testdrive");
    fs.cpSync(EXAMPLES_DIR, root, { recursive: true });
    const sellerDir = path.join(root, "example-seller");
    // the house has no test drive: use the car fixture, give it viewing settings
    const carRoot = path.join(tmp, "car-viewing");
    fs.cpSync(FIXTURE_DIR, carRoot, { recursive: true });
    const file = path.join(carRoot, fixtures.seller, "fixture-car", "product.json");
    const viewing = JSON.parse(fs.readFileSync(path.join(sellerDir, "example-house", "product.json"), "utf8")).viewing;
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), viewing }));
    const e = env({ CONTENT_DIR: carRoot });
    for (const requestType of ["testdrive", "test_drive"]) expect((await post({ ...BASE, requestType, preferredSlots: [{ date: "2026-06-11", time: "10:00" }] }, e)).status, requestType).toBe(200);
    expect(stored(e).map((r) => r.type)).toEqual(["testdrive", "testdrive"]);
  });
});

describe("delivery.notified", () => {
  const TG = { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT };
  const telegram = (status: number) => vi.fn(async () => new Response(JSON.stringify(status === 200 ? { ok: true, result: {} } : { ok: false }), { status }));
  const body = { ...BASE, requestType: "question", message: "Hi" };

  it("a file store with a notifier that answered: the record is written again with notified true", async () => {
    const e = env({ LEADS_STORE: "file", LEADS_NOTIFY: "telegram", ...TG });
    const f = telegram(200);
    expect((await post(body, e, f as unknown as typeof fetch)).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(e.LEADS_DIR)).toHaveLength(1); // the same file, not a second one
    expect(stored(e)[0].delivery).toEqual({ stored: true, store: "file", notified: true });
    expect(leadRecordSchema.safeParse(stored(e)[0]).success).toBe(true);
    expect(fs.statSync(path.join(e.LEADS_DIR, fs.readdirSync(e.LEADS_DIR)[0])).mode & 0o777).toBe(0o600);
  });

  it("a notifier that failed leaves notified false, and the visitor still gets the success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const e = env({ LEADS_STORE: "file", LEADS_NOTIFY: "telegram", ...TG });
    const res = await post(body, e, telegram(500) as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(stored(e)[0].delivery).toEqual({ stored: true, store: "file", notified: false });
  });

  it("no notifier: false. Telegram as the store: true from the start. A webhook receives false", async () => {
    const plain = env({ LEADS_STORE: "file" });
    await post(body, plain);
    expect(stored(plain)[0].delivery.notified).toBe(false);

    const asStore = env({ LEADS_STORE: "telegram", ...TG });
    const f = telegram(200);
    expect((await post(body, asStore, f as unknown as typeof fetch)).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);

    const hook = vi.fn(async (url: string | URL) => (String(url).includes("api.telegram.org") ? new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }) : new Response("{}", { status: 200 })));
    const e = env({ LEADS_STORE: "webhook", LEADS_WEBHOOK_URL: "https://hooks.example/x", LEADS_NOTIFY: "telegram", ...TG });
    expect((await post(body, e, hook as unknown as typeof fetch)).status).toBe(200);
    const sent = JSON.parse(String((hook.mock.calls[0] as unknown as [URL, RequestInit])[1].body)) as LeadRecord;
    expect(sent.delivery).toEqual({ stored: true, store: "webhook", notified: false });
  });

  it("the Telegram message of the store holds the record's facts (the message IS the record there): type, source and amount", async () => {
    const e = env({ LEADS_STORE: "telegram", ...TG });
    const calls: string[] = [];
    const f = vi.fn(async (_u: string | URL, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    });
    expect((await post({ ...OFFER, amount: 800, source: "agent" }, e, f as unknown as typeof fetch)).status).toBe(200);
    expect(calls[0]).toMatch(/Offered amount: .*800/);
    expect(calls[0]).toContain("Sofia (voice agent)");
  });

  it("markNotified changes nothing for another store, and never throws for a file that is gone", async () => {
    const e = env({ LEADS_STORE: "file" });
    await post(body, e);
    const record = stored(e)[0];
    expect(await markNotified(record, { ...e, LEADS_STORE: "webhook" })).toBe(false);
    expect(stored(e)[0].delivery.notified).toBe(false);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await markNotified(record, { ...e, LEADS_DIR: path.join(tmp, "does-not-exist") })).toBe(false);
  });
});

describe("the settings in the content", () => {
  it("offerAmount in product.json is validated: a positive min and max, max above min, nothing else", () => {
    const product = { ...fixtures.sampleJson("fixture-car") };
    const ok = (offerAmount: unknown) => validateProduct({ ...product, offerAmount }).ok;
    expect(ok({ min: 100, max: 700 })).toBe(true);
    expect(ok({ max: 700 })).toBe(true);
    expect(ok({})).toBe(true);
    expect(ok({ min: 700, max: 100 })).toBe(false);
    expect(ok({ min: 0 })).toBe(false);
    expect(ok({ min: -5 })).toBe(false);
    expect(ok({ min: 1, other: 2 })).toBe(false);
    expect(ok({ min: "100" })).toBe(false);
  });

  it("consentVersion in seller.json is a short label of letters, digits and dashes", () => {
    const seller = fixtures.sellerJson();
    const ok = (consentVersion: unknown) => validateSeller({ ...seller, consentVersion }).ok;
    expect(ok("2026-11-03-draft")).toBe(true);
    for (const bad of ["", "Draft", "has space", "x".repeat(25), "-lead", 5]) expect(ok(bad), String(bad)).toBe(false);
    expect(validateSeller(seller).ok).toBe(true); // optional
  });

  it("the seller's consent version reaches the lead context and the record", async () => {
    const root = path.join(tmp, "consent-version");
    fs.cpSync(FIXTURE_DIR, root, { recursive: true });
    const file = path.join(root, fixtures.seller, "seller.json");
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), consentVersion: "2026-11-03-draft" }));
    const e = env({ CONTENT_DIR: root });
    expect(readLeadContext(e).consentVersion).toBe("2026-11-03-draft");
    await post({ ...BASE, requestType: "question", message: "Hi" }, e);
    expect(stored(e)[0]).toMatchObject({ consentVersion: "2026-11-03-draft" });
  });
});

describe("the Multivan's content", () => {
  it("has the viewing block (Mon to Sat, 10:00 to 18:00, 30 minutes, Vienna), a test-drive note, the address text in four languages and the offer range 30,000 to 200,000", async () => {
    const { hasRealContent, content } = await import("./helpers");
    if (!hasRealContent) return;
    const product = content.sampleJson("vw-multivan");
    expect(product.viewing).toMatchObject({ days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: "10:00", to: "18:00", durationMinutes: 30, timezone: "Europe/Vienna" });
    for (const lang of ["de", "en", "tr", "bg"]) {
      expect(product.viewing.address[lang], lang).toBeTruthy();
      expect(product.viewing.testDriveNotes[lang], lang).toBeTruthy();
    }
    expect(product.viewing.address.de).toBe("Die Adresse nennen wir bei der Terminbestätigung.");
    expect(product.viewing.testDriveNotes.de).toBe("Führerschein und Ausweis mitbringen");
    expect(product.offerAmount).toEqual({ min: 30000, max: 200000 });
    const context = readLeadContext({ CONTENT_DIR: content.root, CONTENT_PRODUCT: content.ref("vw-multivan") });
    expect(context.requestTypes).toEqual(["viewing", "testdrive", "question", "offer"]); // the car's four, now that it has viewing settings
    expect(context.offer).toEqual({ min: 30000, max: 200000 });
    expect(context.currency).toBe("EUR");
    expect(context.viewing).toMatchObject({ durationMinutes: 30, timezone: "Europe/Vienna" });
    expect(context.consentVersion).toMatch(/^[0-9a-z-]+$/);
    // the 30-minute grid: 16 starts from 10:00 to 17:30, as the reference site offers
    const { timeSlots } = await import("@/lib/viewing");
    expect(timeSlots(context.viewing!)).toHaveLength(16);
    expect(timeSlots(context.viewing!)[15]).toBe("17:30");
  });
});
