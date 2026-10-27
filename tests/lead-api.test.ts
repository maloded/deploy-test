// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import * as route from "@/app/api/lead/route";
import { cleanText, LIMITS, MIN_FILL_MS, validateLead } from "@/lib/lead";
import { handleLead, MAX_BODY_BYTES } from "@/lib/lead-handler";
import { leadContext, readLeadContext, sha256 } from "@/lib/lead-context";
import { FILE_NAME, storeLead, type LeadRecord } from "@/lib/leads";
import { leadLimiter, RateLimiter } from "@/lib/rate-limit";
import { FIXTURE_DIR, fixtures } from "./helpers";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lead-api-"));
afterAll(() => {
  fs.chmodSync(tmp, 0o700);
  for (const d of fs.readdirSync(tmp)) fs.chmodSync(path.join(tmp, d), 0o700);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const REF = `${fixtures.seller}/fixture-car`;
let n = 0;
const dir = () => path.join(tmp, `leads${n++}`);
const baseEnv = (extra: Record<string, string> = {}) => ({ CONTENT_DIR: FIXTURE_DIR, CONTENT_PRODUCT: REF, LEADS_STORE: "file", LEADS_DIR: dir(), ...extra });
const files = (env: Record<string, string>) => (fs.existsSync(env.LEADS_DIR) ? fs.readdirSync(env.LEADS_DIR) : []);

const GOOD = { lang: "en", requestType: "question", name: "Test Person", email: "person@example.invalid", consent: true, website: "", elapsedMs: MIN_FILL_MS + 500 };
const UA = "TestBrowser/1.0 (UA-MARKER)";
let ip = 0;
const post = (body: unknown, headers: Record<string, string> = {}, env = baseEnv(), fetchImpl?: typeof fetch) =>
  handleLead(
    new Request("http://localhost:3000/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lead-request": "1", host: "localhost:3000", "user-agent": UA, "x-forwarded-for": `203.0.113.${(ip++ % 250) + 1}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
    fetchImpl,
  );

beforeEach(() => leadLimiter.reset());
afterEach(() => vi.restoreAllMocks());

describe("validation and limits", () => {
  const codes = (body: object) => {
    const r = validateLead({ ...GOOD, ...body });
    return r.ok ? {} : r.errors;
  };

  it("accepts a good body and a body with every field", () => {
    expect(validateLead(GOOD).ok).toBe(true);
    expect(validateLead({ ...GOOD, phone: "+43 1 000 00", channel: "telegram", bestTime: "evenings", message: "Hi" }).ok).toBe(true);
  });

  it("names one code per bad field and never the value", async () => {
    expect(codes({ name: "" })).toEqual({ name: "required" });
    expect(codes({ name: "x".repeat(LIMITS.name + 1) })).toEqual({ name: "max" });
    expect(codes({ email: "nope" })).toEqual({ email: "email" });
    expect(codes({ email: "" })).toEqual({ email: "required" });
    expect(codes({ email: undefined })).toEqual({ email: "required" });
    expect(codes({ phone: "abc" })).toEqual({ phone: "phone" });
    expect(codes({ channel: "fax" })).toMatchObject({ channel: "invalid" });
    expect(codes({ message: "x".repeat(LIMITS.message + 1) })).toEqual({ message: "max" });
    expect(codes({ bestTime: "x".repeat(LIMITS.bestTime + 1) })).toEqual({ bestTime: "max" });
    expect(codes({ consent: false })).toEqual({ consent: "consent" });
    expect(codes({ consent: undefined })).toEqual({ consent: "consent" });
    expect(codes({ lang: "fr" })).toEqual({ form: "invalid" });
    expect(codes({ elapsedMs: -1 })).toEqual({ form: "invalid" });
    const res = await post({ ...GOOD, name: "", email: "secret-not-an-email" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("secret-not-an-email");
  });

  it("refuses unknown fields (the schema is strict), also the old agent source", () => {
    expect(codes({ extra: 1 })).toEqual({ form: "invalid" });
    expect(codes({ source: "agent" })).toEqual({ form: "invalid" });
    expect(codes({ source: "form" })).toEqual({ form: "invalid" }); // the source is set by the server, never sent
  });

  it("needs a request type of the registry", () => {
    expect(codes({ requestType: "booking" })).toMatchObject({ requestType: "invalid" });
    expect(codes({ requestType: undefined })).toMatchObject({ requestType: "invalid" });
    for (const requestType of ["question", "offer"]) expect(validateLead({ ...GOOD, requestType }).ok, requestType).toBe(true);
    const slots = [{ date: "2026-11-05", time: "10:00" }];
    for (const requestType of ["viewing", "test_drive"]) {
      expect(validateLead({ ...GOOD, requestType, preferredSlots: slots }).ok, requestType).toBe(true);
      expect(codes({ requestType })).toEqual({ preferredSlots: "required" }); // these types need at least one slot
    }
    expect(codes({ requestType: "question", preferredSlots: slots })).toEqual({ preferredSlots: "invalid" }); // and the others take none
    expect(codes({ requestType: "viewing", preferredSlots: [slots[0], slots[0], slots[0], slots[0]] })).toMatchObject({ preferredSlots: expect.any(String) });
    expect(codes({ requestType: "viewing", preferredSlots: [{ date: "2026-11-05", time: "10:00", extra: 1 }] })).toMatchObject({ preferredSlots: expect.any(String) });
  });

  it("accepts a message of exactly 1000 characters", () => {
    expect(validateLead({ ...GOOD, message: "x".repeat(1000) }).ok).toBe(true);
  });

  it("normalises: tags and control characters removed, spaces collapsed, empty optionals left out", () => {
    expect(cleanText("  Ann <b>Lee</b>\u0000​  Smith ")).toBe("Ann Lee Smith");
    expect(cleanText("a<script>alert(1)</script>b")).toBe("aalert(1)b");
    expect(cleanText("1 < 2")).toBe("1 2"); // a lone angle bracket is dropped
    expect(cleanText("1 < 2 > 0")).toBe("1 0"); // and "< 2 >" reads as a tag
    expect(cleanText("line one\r\n\r\n\r\n\r\nline  two", true)).toBe("line one\n\nline two");
    const r = validateLead({ ...GOOD, phone: "  ", message: " <i>hi</i> ", bestTime: "" });
    expect(r.ok && r.data).toMatchObject({ message: "hi" });
    expect(r.ok && "phone" in r.data).toBe(false);
    expect(r.ok && "bestTime" in r.data).toBe(false);
  });
});

describe("POST /api/lead", () => {
  it("stores a good lead and answers { ok: true }", async () => {
    const env = baseEnv();
    const res = await post(GOOD, {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(files(env)).toHaveLength(1);
  });

  it("swallows a honeypot hit: the same answer as a success, nothing stored", async () => {
    const env = baseEnv();
    const res = await post({ ...GOOD, website: "http://spam.example" }, {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(files(env)).toEqual([]);
    const withoutDetails = await post({ website: "x" }, {}, env); // even a body that would fail validation
    expect(withoutDetails.status).toBe(200);
    expect(files(env)).toEqual([]);
  });

  it("answers a post that is too fast with a visible 422 and stores nothing; the minimum itself passes", async () => {
    const env = baseEnv();
    const fast = await post({ ...GOOD, elapsedMs: MIN_FILL_MS - 1 }, {}, env);
    expect(fast.status).toBe(422);
    expect(await fast.json()).toEqual({ ok: false, error: "too-fast" });
    expect(files(env)).toEqual([]);
    expect((await post({ ...GOOD, elapsedMs: MIN_FILL_MS }, {}, env)).status).toBe(200);
  });

  it("checks validation before the fill time, so a person gets their field errors", async () => {
    const res = await post({ ...GOOD, name: "", elapsedMs: 0 });
    expect(res.status).toBe(400);
  });

  it("limits each client to 5 posts per window and lets another client through", async () => {
    const env = baseEnv();
    const same = { "x-forwarded-for": "198.51.100.7" };
    for (let i = 0; i < 5; i++) expect((await post(GOOD, same, env)).status).toBe(200);
    const sixth = await post(GOOD, same, env);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ ok: false, error: "rate-limited" });
    expect((await post(GOOD, { "x-forwarded-for": "198.51.100.8" }, env)).status).toBe(200);
    expect(files(env)).toHaveLength(6);
  });

  it("the limiter forgets after its window and stays bounded", () => {
    const l = new RateLimiter(2, 1000, 4);
    expect([l.allow("a", 0), l.allow("a", 1), l.allow("a", 2)]).toEqual([true, true, false]);
    expect(l.allow("a", 1001)).toBe(true);
    for (const c of ["b", "c", "d", "e", "f", "g"]) l.allow(c, 2000);
    expect((l as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(4);
  });

  it("refuses a post without the custom header, from another origin, or marked cross-site", async () => {
    expect((await post(GOOD, { "x-lead-request": "" })).status).toBe(403);
    expect((await post(GOOD, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(GOOD, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post(GOOD, { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect((await post(GOOD, { origin: "https://site.example", host: "internal", "x-forwarded-host": "site.example" })).status).toBe(200);
  });

  it("wants JSON, and refuses a body that is too large or not JSON", async () => {
    expect((await post(GOOD, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
    expect((await post("[1,2]")).status).toBe(400);
    expect((await post(JSON.stringify({ ...GOOD, message: "x".repeat(MAX_BODY_BYTES) }))).status).toBe(413);
    expect((await post(GOOD, { "content-length": String(MAX_BODY_BYTES + 1) })).status).toBe(413);
  });

  it("the route exports only POST, as a dynamic route", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic"]);
    expect(route.dynamic).toBe("force-dynamic");
  });
});

describe("the stored record", () => {
  const read = (env: Record<string, string>) => {
    const [name] = files(env);
    const text = fs.readFileSync(path.join(env.LEADS_DIR, name), "utf8");
    return { name, text, record: JSON.parse(text) as LeadRecord };
  };

  it("has the expected fields: no IP, no raw user agent, the consent hash, source form", async () => {
    const env = baseEnv();
    await post({ ...GOOD, phone: "+43 1 000", channel: "whatsapp", bestTime: "evenings", message: "Hello <b>there</b>" }, { "x-forwarded-for": "203.0.113.77" }, env);
    const { name, text, record } = read(env);
    expect(Object.keys(record).sort()).toEqual(["bestTime", "channel", "consent", "consentTextSha256", "email", "id", "lang", "message", "name", "phone", "product", "receivedAt", "requestType", "source", "userAgentSha256"]);
    expect(record).toMatchObject({ product: REF, lang: "en", name: "Test Person", email: "person@example.invalid", phone: "+43 1 000", channel: "whatsapp", bestTime: "evenings", message: "Hello there", consent: true, source: "form" });
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(record.consentTextSha256).toBe(sha256(fixtures.sellerJson().consentText.en));
    expect(record.userAgentSha256).toBe(sha256(UA));
    expect(text).not.toContain("203.0.113");
    expect(text).not.toContain("UA-MARKER");
    expect(text).not.toMatch(/<[a-z]/i);
    expect(name).toMatch(FILE_NAME);
    expect(name).toBe(`${record.receivedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${record.id}.json`);
    expect(fs.statSync(path.join(env.LEADS_DIR, name)).mode & 0o777).toBe(0o600);
  });

  it("omits the optional fields that were not given", async () => {
    const env = baseEnv();
    await post(GOOD, {}, env);
    expect(Object.keys(read(env).record).sort()).toEqual(["consent", "consentTextSha256", "email", "id", "lang", "name", "product", "receivedAt", "requestType", "source", "userAgentSha256"]);
  });

  it("stores the page language and the hash of the consent text shown in that language", async () => {
    const env = baseEnv();
    await post({ ...GOOD, lang: "de" }, {}, env);
    const { record } = read(env);
    expect(record.lang).toBe("de");
    expect(record.consentTextSha256).toBe(sha256(fixtures.sellerJson().consentText.de));
    expect(record.consentTextSha256).not.toBe(sha256(fixtures.sellerJson().consentText.en));
  });

  it("refuses a language the seller does not offer", async () => {
    const root = path.join(tmp, "one-language");
    fs.cpSync(FIXTURE_DIR, root, { recursive: true });
    const sellerFile = path.join(root, fixtures.seller, "seller.json");
    const seller = JSON.parse(fs.readFileSync(sellerFile, "utf8"));
    fs.writeFileSync(sellerFile, JSON.stringify({ ...seller, languages: ["en"] }));
    const env = baseEnv({ CONTENT_DIR: root });
    expect((await post({ ...GOOD, lang: "de" }, {}, env)).status).toBe(400);
    expect(files(env)).toEqual([]);
  });

  it("stores the request type, and refuses a type the product does not offer (a car fixture without viewing settings)", async () => {
    const env = baseEnv();
    await post({ ...GOOD, requestType: "offer" }, {}, env);
    expect(read(env).record.requestType).toBe("offer");
    for (const requestType of ["viewing", "test_drive"]) {
      const res = await post({ ...GOOD, requestType, preferredSlots: [{ date: "2026-11-05", time: "10:00" }] }, {}, env);
      expect(res.status, requestType).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "invalid", errors: { requestType: "invalid" } });
    }
    expect(files(env)).toHaveLength(1);
  });

  it("the site context lists the types of the product type (car: question and offer while there is no viewing config)", () => {
    expect(readLeadContext({ CONTENT_DIR: FIXTURE_DIR, CONTENT_PRODUCT: REF }).requestTypes).toEqual(["question", "offer"]);
  });

  it("keeps a lead per file and never overwrites", async () => {
    const env = baseEnv();
    await post(GOOD, {}, env);
    await post(GOOD, {}, env);
    expect(files(env)).toHaveLength(2);
  });
});

describe("a store that does not work is never a success", () => {
  const unavailable = async (res: Response) => {
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
  };

  it("with no store configured", async () => {
    const env = baseEnv();
    delete (env as Record<string, string | undefined>).LEADS_STORE;
    await unavailable(await post(GOOD, {}, env));
    await unavailable(await post(GOOD, {}, baseEnv({ LEADS_STORE: "carrier-pigeon" })));
  });

  it.skipIf(process.getuid?.() === 0)("with a read-only folder (the host's read-only file system)", async () => {
    const readonly = path.join(tmp, "readonly");
    fs.mkdirSync(readonly);
    fs.chmodSync(readonly, 0o500);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await unavailable(await post(GOOD, {}, baseEnv({ LEADS_DIR: path.join(readonly, "leads") })));
    expect(fs.readdirSync(readonly)).toEqual([]);
    expect(spy.mock.calls.flat().join(" ")).toMatch(/lead not stored \(file: (EACCES|EROFS)\)/);
    expect(spy.mock.calls.flat().join(" ")).not.toContain("person@");
  });

  it("with a LEADS_DIR that is a file", async () => {
    const file = path.join(tmp, "a-file");
    fs.writeFileSync(file, "x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await unavailable(await post(GOOD, {}, baseEnv({ LEADS_DIR: file })));
  });

  it("with the site context unreadable (no inlined context and no content)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await unavailable(await post(GOOD, {}, baseEnv({ CONTENT_DIR: path.join(tmp, "nothing-here") })));
  });

  it("uses the inlined LEAD_CONTEXT, so a host without content files still works", async () => {
    const context = JSON.stringify(readLeadContext({ CONTENT_DIR: FIXTURE_DIR, CONTENT_PRODUCT: REF }));
    const env = baseEnv({ CONTENT_DIR: path.join(tmp, "nothing-here"), LEAD_CONTEXT: context });
    expect((await post(GOOD, {}, env)).status).toBe(200);
    expect(files(env)).toHaveLength(1);
    expect(leadContext({ LEAD_CONTEXT: "{broken" })).toBeNull();
  });

  it("next.config inlines the context for the build", () => {
    const inlined = JSON.parse((nextConfig.env as Record<string, string>).LEAD_CONTEXT ?? "null");
    const expected = (() => {
      try {
        return readLeadContext();
      } catch {
        return null;
      }
    })();
    expect(inlined).toEqual(expected);
  });
});

describe("the webhook store", () => {
  const hook = { LEADS_STORE: "webhook", LEADS_WEBHOOK_URL: "https://hooks.example/secret-token-123" };

  it("POSTs the record as JSON with fetch and answers ok only after a 2xx", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 202 }));
    const res = await post(GOOD, {}, baseEnv(hook), f as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(hook.LEADS_WEBHOOK_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    const sent = JSON.parse(String(init.body)) as LeadRecord;
    expect(sent).toMatchObject({ source: "form", product: REF, email: "person@example.invalid", consent: true });
    expect(JSON.stringify(sent)).not.toContain("203.0.113");
  });

  it.each([
    ["a 500", async () => new Response("no", { status: 500 })],
    ["a network error", async () => Promise.reject(Object.assign(new TypeError("fetch failed https://hooks.example/secret-token-123"), { name: "TypeError" }))],
  ])("answers 503 for %s, without leaking the URL or the lead into the log", async (_l, impl) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(GOOD, {}, baseEnv(hook), vi.fn(impl) as unknown as typeof fetch);
    expect(res.status).toBe(503);
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toMatch(/lead not stored \(webhook: /);
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("person@");
  });

  it("answers 503 for a missing or invalid webhook URL, and never calls fetch", async () => {
    const f = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const url of ["", "not a url", "ftp://x.example/hook"]) {
      expect((await post(GOOD, {}, baseEnv({ LEADS_STORE: "webhook", LEADS_WEBHOOK_URL: url }), f as unknown as typeof fetch)).status).toBe(503);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("storeLead throws a LeadStoreError with a reason that holds no data", async () => {
    const record = { id: "x" } as LeadRecord;
    await expect(storeLead(record, {})).rejects.toMatchObject({ reason: "LEADS_STORE is not set" });
  });
});
