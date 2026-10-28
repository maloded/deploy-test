// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chatsOf, runChats, runTest, TEST_TEXT } from "../scripts/lib/telegram-commands.mjs";
import { FAKE_CHAT, FAKE_TOKEN } from "./telegram-fakes";

/** A mock of the Bot API on localhost: the answers are set per test, the requests are recorded. */
let server: http.Server;
let apiBase = "";
let requests: { method: string; body: Record<string, unknown> }[] = [];
let answers: Record<string, { status?: number; body: unknown }> = {};
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const method = String(req.url).replace(`/bot${FAKE_TOKEN}/`, "");
      requests.push({ method, body: raw ? JSON.parse(raw) : {} });
      const a = String(req.url).startsWith(`/bot${FAKE_TOKEN}/`) ? answers[method] : { status: 401, body: { ok: false, description: "Unauthorized" } };
      res.writeHead(a ? (a.status ?? 200) : 404, { "content-type": "application/json" });
      res.end(JSON.stringify(a?.body ?? { ok: false }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  apiBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  requests = [];
  answers = { getMe: { body: { ok: true, result: { id: 1, is_bot: true, username: "fake_example_bot" } } }, getWebhookInfo: { body: { ok: true, result: { url: "" } } } };
});

const ENV = { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT };
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, all: () => [...out, ...err].join("\n") };
};
// updates that carry what must NEVER be printed: message texts and user names
const PRIVATE_STUFF = ["Secret message text 4711", "Visitor Fullname", "visitor_handle"];
const update = (chat: Record<string, unknown>) => ({ update_id: 1, message: { text: PRIVATE_STUFF[0], from: { first_name: "Visitor", last_name: "Fullname", username: PRIVATE_STUFF[2] }, chat } });

describe("npm run telegram:chats", () => {
  it("lists the id, type and title of a group, and never a message text or a user name", async () => {
    answers.getUpdates = { body: { ok: true, result: [update({ id: -1000000000001, type: "supergroup", title: "Fake Sales Group" }), update({ id: -1000000000001, type: "supergroup", title: "Fake Sales Group" }), update({ id: 42424, type: "private", first_name: "Visitor", last_name: "Fullname", username: PRIVATE_STUFF[2] })] } };
    const c = capture();
    expect(await runChats(ENV, c.io, { apiBase })).toBe(0);
    expect(c.out).toContain("-1000000000001\tsupergroup\tFake Sales Group");
    expect(c.all()).not.toMatch(/42424/); // the private chat is not listed at all
    for (const secret of [...PRIVATE_STUFF, FAKE_TOKEN, "Visitor"]) expect(c.all()).not.toContain(secret);
  });

  it("warns when the bot has no updates, with the /start@<botname> hint, admin and privacy mode", async () => {
    answers.getUpdates = { body: { ok: true, result: [] } };
    const c = capture();
    expect(await runChats(ENV, c.io, { apiBase })).toBe(0);
    const text = c.all();
    expect(text).toContain("no updates");
    expect(text).toContain("/start@fake_example_bot");
    expect(text).toMatch(/privacy mode/i);
    expect(text).toMatch(/admin/);
    expect(text).toContain("/setprivacy");
  });

  it("hints the same when the updates come only from private chats (the bot is a member of no group)", async () => {
    answers.getUpdates = { body: { ok: true, result: [update({ id: 42424, type: "private", first_name: "Visitor" })] } };
    const c = capture();
    await runChats(ENV, c.io, { apiBase });
    expect(c.all()).toMatch(/may not be a member of any/);
    expect(c.all()).toContain("/start@fake_example_bot");
    for (const secret of PRIVATE_STUFF) expect(c.all()).not.toContain(secret);
  });

  it("warns about a webhook and does not call getUpdates", async () => {
    answers.getWebhookInfo = { body: { ok: true, result: { url: "https://example.invalid/hook" } } };
    const c = capture();
    expect(await runChats(ENV, c.io, { apiBase })).toBe(0);
    expect(c.all()).toMatch(/webhook is set/);
    expect(c.all()).not.toContain("example.invalid");
    expect(requests.map((r) => r.method)).not.toContain("getUpdates");
  });

  it("a wrong token gives a short verdict, exit 1, and prints no token", async () => {
    answers.getMe = { status: 401, body: { ok: false, description: "Unauthorized" } };
    const c = capture();
    expect(await runChats(ENV, c.io, { apiBase })).toBe(1);
    expect(c.err.join("\n")).toContain("token is wrong or was revoked");
    expect(c.all()).not.toContain(FAKE_TOKEN);
  });

  it("refuses without a valid token and contacts nobody", async () => {
    const c = capture();
    expect(await runChats({ TELEGRAM_BOT_TOKEN: "nonsense" }, c.io, { apiBase })).toBe(1);
    expect(c.all()).toContain("TELEGRAM_BOT_TOKEN");
    expect(c.all()).not.toContain("nonsense");
    expect(requests).toEqual([]);
  });

  it("chatsOf reads only id, type and the title of a non-private chat", () => {
    expect(chatsOf([update({ id: 1, type: "private", title: "Not A Title", first_name: "Visitor" }), update({ id: 2, type: "channel", title: "Chan\u0000nel" })])).toEqual([
      { id: 1, type: "private", title: "" },
      { id: 2, type: "channel", title: "Channel" },
    ]);
  });
});

describe("npm run telegram:test", () => {
  it("sends the fake message through the adapter and prints only the status and a verdict", async () => {
    answers.sendMessage = { body: { ok: true, result: {} } };
    const c = capture();
    expect(await runTest(ENV, c.io, { apiBase })).toBe(0);
    expect(requests).toEqual([{ method: "sendMessage", body: { chat_id: FAKE_CHAT, text: "Test message, no visitor data", disable_web_page_preview: true } }]);
    expect(TEST_TEXT).toBe("Test message, no visitor data");
    expect(c.out).toEqual(["HTTP 200: Telegram accepted the test message. Delivery works."]);
    for (const secret of [FAKE_TOKEN, FAKE_CHAT]) expect(c.all()).not.toContain(secret);
  });

  it("works whatever LEADS_STORE and TELEGRAM_DETAIL say", async () => {
    answers.sendMessage = { body: { ok: true, result: {} } };
    expect(await runTest({ ...ENV, LEADS_STORE: "telegram", TELEGRAM_DETAIL: "short" }, capture().io, { apiBase })).toBe(0);
  });

  it("refuses when variables are missing, naming them, and sends nothing", async () => {
    const c = capture();
    expect(await runTest({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN }, c.io, { apiBase })).toBe(1);
    expect(c.err.join("\n")).toContain("TELEGRAM_CHAT_ID");
    expect(c.all()).not.toContain(FAKE_TOKEN);
    expect(requests).toEqual([]);
  });

  it("prints the HTTP status and a verdict for a refusal, without Telegram's description", async () => {
    answers.sendMessage = { status: 400, body: { ok: false, description: "Bad Request: chat not found " + FAKE_CHAT } };
    const c = capture();
    expect(await runTest(ENV, c.io, { apiBase })).toBe(1);
    expect(c.err[0]).toMatch(/^HTTP 400: .*chat id is wrong/);
    expect(c.all()).not.toContain("chat not found");
    for (const secret of [FAKE_TOKEN, FAKE_CHAT]) expect(c.all()).not.toContain(secret);
  });

  it("says so when Telegram cannot be reached", async () => {
    const c = capture();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    expect(await runTest(ENV, c.io, {})).toBe(1);
    expect(c.err[0]).toMatch(/No HTTP answer: Telegram could not be reached/);
    vi.restoreAllMocks();
  });
});
