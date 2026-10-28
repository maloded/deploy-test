// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLead } from "@/lib/lead-handler";
import { readLeadContext } from "@/lib/lead-context";
import { MIN_FILL_MS } from "@/lib/lead";
import { OWNER_LABELS } from "@/lib/owner-message";
import { leadLimiter } from "@/lib/rate-limit";
import { NOTIFY_TIMEOUT_MS, STORE_TIMEOUT_MS } from "@/lib/telegram";
import { EXAMPLES_DIR, examples } from "./helpers";
import { FAKE_CHAT, FAKE_TOKEN } from "./telegram-fakes";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lead-telegram-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const WATCH = examples.ref("example-watch"); // question and offer, no viewing
const NAME = "Quill Featherstone";
const MAIL = "quill.featherstone@example.invalid";
const NOTE = "Secret-Note-For-The-Seller-4711";
const BODY = { lang: "en", requestType: "question", name: NAME, email: MAIL, message: NOTE, consent: true, website: "", elapsedMs: MIN_FILL_MS + 500 };
const TG = { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT };
let n = 0;
const env = (extra: Record<string, string> = {}) => ({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: WATCH, LEADS_DIR: path.join(tmp, `l${n++}`), ...extra });
const ownerLang = readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: WATCH }).defaultLanguage!;

let ip = 0;
const post = (e: Record<string, string>, fetchImpl: typeof fetch, body: unknown = BODY) =>
  handleLead(
    new Request("http://localhost:3000/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lead-request": "1", host: "localhost:3000", "x-forwarded-for": `198.51.100.${(ip++ % 250) + 1}` },
      body: JSON.stringify(body),
    }),
    e,
    fetchImpl,
  );
const tgOk = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
const tgStatus = (status: number) => new Response(JSON.stringify({ ok: false, description: `${FAKE_TOKEN} ${FAKE_CHAT} ${NAME}` }), { status });
/** A fetch that answers the Telegram URL with `answer` and records the calls; any other URL is a webhook that answers 200. */
const fake = (answer: () => Response | Promise<Response>) => {
  const calls: { url: string; text?: string }[] = [];
  const f = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url: u, text: body.text });
    return u.includes("api.telegram.org") ? answer() : new Response("{}", { status: 200 });
  });
  return { f: f as unknown as typeof fetch, calls, telegram: () => calls.filter((c) => c.url.includes("api.telegram.org")) };
};
let logged: string[] = [];
beforeEach(() => {
  leadLimiter.reset();
  logged = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
});
afterEach(() => vi.restoreAllMocks());
const stored = (e: Record<string, string>) => (fs.existsSync(e.LEADS_DIR) ? fs.readdirSync(e.LEADS_DIR) : []);
const noLeak = () => {
  for (const secret of [FAKE_TOKEN, "123456:", FAKE_CHAT, NAME, MAIL, NOTE]) expect(logged.join("\n"), secret).not.toContain(secret);
};

describe("Telegram as the store", () => {
  it("answers 200 only when Telegram answers ok:true, and sends the full message in the seller's language", async () => {
    const t = fake(tgOk);
    const res = await post(env({ LEADS_STORE: "telegram", ...TG }), t.f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(t.telegram()).toHaveLength(1);
    const text = t.telegram()[0].text!;
    expect(text).toContain(`${OWNER_LABELS.title[ownerLang]} #`);
    for (const value of [NAME, MAIL, NOTE]) expect(text).toContain(value);
    // the product line carries the title inlined in the lead context, then the reference in brackets; the window line is there
    const context = readLeadContext({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: WATCH });
    expect(context.productTitle).toBeTruthy();
    expect(text).toContain(`${context.productTitle} (${WATCH})`);
    expect(text).toContain(`${OWNER_LABELS.contactWindow[ownerLang]}: `);
    expect(logged).toEqual([]);
  });

  it.each([
    ["a 500", () => tgStatus(500), "5xx"],
    ["a 401", () => tgStatus(401), "4xx"],
    ["ok:false with status 200", () => new Response(JSON.stringify({ ok: false }), { status: 200 }), "answer"],
  ] as const)("%s from Telegram answers 503 and logs one generic line", async (_l, answer, reason) => {
    const res = await post(env({ LEADS_STORE: "telegram", ...TG }), fake(answer).f);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
    expect(logged).toEqual([`lead not stored (telegram: ${reason})`]);
    noLeak();
  });

  it("a network error is retried once, then answers 503; a timeout is not retried", async () => {
    const t = fake(() => Promise.reject(new TypeError(`fetch failed ${FAKE_TOKEN} ${NAME}`)));
    expect((await post(env({ LEADS_STORE: "telegram", ...TG }), t.f)).status).toBe(503);
    expect(t.telegram()).toHaveLength(2);
    expect(logged).toEqual(["lead not stored (telegram: network)"]);
    noLeak();
  });

  it("uses the 8 second store timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await post(env({ LEADS_STORE: "telegram", ...TG }), fake(tgOk).f);
    expect(STORE_TIMEOUT_MS).toBe(8000);
    expect(spy).toHaveBeenCalledWith(STORE_TIMEOUT_MS);
  });

  it.each([
    ["no token", { TELEGRAM_CHAT_ID: FAKE_CHAT }, "TELEGRAM_BOT_TOKEN"],
    ["no chat id", { TELEGRAM_BOT_TOKEN: FAKE_TOKEN }, "TELEGRAM_CHAT_ID"],
    ["a bad chat id format", { ...TG, TELEGRAM_CHAT_ID: "my secret group" }, "TELEGRAM_CHAT_ID"],
    ["short as the only store", { ...TG, TELEGRAM_DETAIL: "short" }, "TELEGRAM_DETAIL"],
  ] as const)("a configuration error (%s) answers 503 and logs the variable NAMES only", async (_l, vars, names) => {
    const t = fake(tgOk);
    const res = await post(env({ LEADS_STORE: "telegram", ...vars }), t.f);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
    expect(logged).toEqual([`lead not stored (telegram: configuration error in ${names})`]);
    expect(t.calls).toEqual([]); // nothing was sent anywhere
    expect(logged.join("")).not.toContain("secret group");
    noLeak();
  });

  it("Telegram as store and as notifier at once is refused before anything is sent", async () => {
    const t = fake(tgOk);
    const res = await post(env({ LEADS_STORE: "telegram", LEADS_NOTIFY: "telegram", ...TG }), t.f);
    expect(res.status).toBe(503);
    expect(logged).toEqual(["lead not stored (telegram: configuration error in LEADS_STORE, LEADS_NOTIFY)"]);
    expect(t.calls).toEqual([]);
  });
});

describe("Telegram as the notifier", () => {
  const file = () => env({ LEADS_STORE: "file", LEADS_NOTIFY: "telegram", ...TG });

  it("sends a short message after the store accepted the lead: stored, 200, and none of the personal data in the message", async () => {
    const e = file();
    const t = fake(tgOk);
    const res = await post(e, t.f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(stored(e)).toHaveLength(1);
    expect(t.telegram()).toHaveLength(1);
    for (const value of [NAME, MAIL, NOTE]) expect(t.telegram()[0].text).not.toContain(value);
    expect(t.telegram()[0].text).toContain(OWNER_LABELS.hint[ownerLang]);
  });

  it("sends the full message only when TELEGRAM_DETAIL=full is set explicitly", async () => {
    const t = fake(tgOk);
    await post({ ...file(), TELEGRAM_DETAIL: "full" }, t.f);
    for (const value of [NAME, MAIL, NOTE]) expect(t.telegram()[0].text).toContain(value);
  });

  it.each([
    ["a 500", () => tgStatus(500), "5xx"],
    ["a 403", () => tgStatus(403), "4xx"],
    ["a network error", () => Promise.reject(new TypeError(`fetch failed ${FAKE_TOKEN}`)), "network"],
  ] as const)("%s never changes the visitor's answer; one generic line is logged", async (_l, answer, reason) => {
    const e = file();
    const res = await post(e, fake(answer).f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(stored(e)).toHaveLength(1);
    expect(logged).toEqual([`lead notification not sent (${reason})`]);
    noLeak();
  });

  it("has its own 4 second timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await post(file(), fake(tgOk).f);
    expect(NOTIFY_TIMEOUT_MS).toBe(4000);
    expect(spy).toHaveBeenCalledWith(NOTIFY_TIMEOUT_MS);
  });

  it("a misconfigured notifier does not change the answer either; the names are logged", async () => {
    const e = env({ LEADS_STORE: "file", LEADS_NOTIFY: "telegram", TELEGRAM_BOT_TOKEN: FAKE_TOKEN });
    const t = fake(tgOk);
    expect((await post(e, t.f)).status).toBe(200);
    expect(stored(e)).toHaveLength(1);
    expect(t.calls).toEqual([]);
    expect(logged).toEqual(["lead notification not sent (configuration error in TELEGRAM_CHAT_ID)"]);
    logged = [];
    expect((await post(env({ LEADS_STORE: "file", LEADS_NOTIFY: "email" }), t.f)).status).toBe(200);
    expect(logged).toEqual(["lead notification not sent (configuration error in LEADS_NOTIFY)"]);
  });

  it("a notifier alone is not a store: 503, nothing sent", async () => {
    const t = fake(tgOk);
    const res = await post(env({ LEADS_NOTIFY: "telegram", ...TG }), t.f);
    expect(res.status).toBe(503);
    expect(t.calls).toEqual([]);
  });

  it("is not called when the store failed", async () => {
    const calls: string[] = [];
    const f = (async (url: string | URL) => {
      calls.push(String(url));
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    const res = await post(env({ LEADS_STORE: "webhook", LEADS_WEBHOOK_URL: "https://example.invalid/hook", LEADS_NOTIFY: "telegram", ...TG }), f);
    expect(res.status).toBe(503);
    expect(calls.filter((c) => c.includes("api.telegram.org"))).toEqual([]);
  });

  it("is not called for a honeypot post", async () => {
    const t = fake(tgOk);
    await post(file(), t.f, { ...BODY, website: "bot" });
    expect(t.calls).toEqual([]);
  });
});
