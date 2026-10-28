// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { callTelegram, MAX_TEXT, sendTelegram, telegramText, TelegramError } from "@/lib/telegram";
import { FAKE_CHAT, FAKE_TOKEN } from "./telegram-fakes";

const CONFIG = { token: FAKE_TOKEN, chatId: FAKE_CHAT };
const SECRET_TEXT = "Secret-Visitor-Text-12345";
const answer = (status: number, body: unknown = { ok: status === 200, result: {} }) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.restoreAllMocks());

describe("the Telegram adapter", () => {
  it("posts plain JSON to the bot's sendMessage URL: chat_id, text, no preview, no parse_mode", async () => {
    const f = vi.fn(async () => answer(200));
    await sendTelegram(CONFIG, "Hello", { fetchImpl: f as unknown as typeof fetch });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: FAKE_CHAT, text: "Hello", disable_web_page_preview: true });
    expect(String(init.body)).not.toContain("parse_mode");
  });

  it("delivers only when Telegram answers ok:true: a 200 with ok:false, or a status, is a failure with a generic reason", async () => {
    for (const [res, reason] of [
      [answer(200, { ok: false }), "answer"],
      [answer(200, "not json"), "answer"],
      [answer(401, { ok: false, description: "Unauthorized " + SECRET_TEXT }), "4xx"],
      [answer(429, { ok: false }), "4xx"],
      [answer(502, { ok: false }), "5xx"],
    ] as const) {
      const f = vi.fn(async () => res.clone());
      await expect(sendTelegram(CONFIG, SECRET_TEXT, { fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ name: "TelegramError", reason });
      expect(f).toHaveBeenCalledTimes(1); // a status is final: no retry
    }
  });

  it("strips control characters but keeps line breaks", () => {
    expect(telegramText("a\u0000b\u0007c\u001bd\u007fe​f g﻿h\r\ni\tj\nk")).toBe("abcdefgh\ni j\nk");
  });

  it("cuts the text to the limit without splitting a surrogate pair", () => {
    expect(telegramText("x".repeat(MAX_TEXT))).toHaveLength(MAX_TEXT);
    const cut = telegramText("x".repeat(MAX_TEXT + 500));
    expect(cut).toHaveLength(MAX_TEXT);
    expect(cut.endsWith("…")).toBe(true);
    const emoji = telegramText("x".repeat(MAX_TEXT - 2) + "\u{1F600}\u{1F600}");
    expect(emoji.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(emoji).not.toMatch(/[\ud800-\udbff]…$/);
  });

  it("the cut and the cleaning are what is sent", async () => {
    const f = vi.fn(async () => answer(200));
    await sendTelegram(CONFIG, "a\u0000" + "y".repeat(5000), { fetchImpl: f as unknown as typeof fetch });
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).text as string;
    expect(sent).toHaveLength(MAX_TEXT);
    expect(sent).not.toContain("\u0000");
  });

  it("retries once, and only after a network error", async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed: " + FAKE_TOKEN)).mockResolvedValueOnce(answer(200));
    await sendTelegram(CONFIG, "x", { fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn().mockRejectedValue(new TypeError("fetch failed: " + FAKE_TOKEN));
    await expect(sendTelegram(CONFIG, "x", { fetchImpl: g as unknown as typeof fetch })).rejects.toMatchObject({ reason: "network" });
    expect(g).toHaveBeenCalledTimes(2); // one retry, no loop
  });

  it("does not retry a timeout, and gives up when the time is over", async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason))));
    await expect(sendTelegram(CONFIG, "x", { fetchImpl: f as unknown as typeof fetch, timeoutMs: 30 })).rejects.toMatchObject({ reason: "timeout" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("never lets the token, the chat id or the text into a thrown error or the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const failures = [
      vi.fn().mockRejectedValue(new TypeError(`fetch failed https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage ${FAKE_CHAT} ${SECRET_TEXT}`)),
      vi.fn(async () => answer(500, { ok: false, description: `${FAKE_TOKEN} ${FAKE_CHAT} ${SECRET_TEXT}` })),
      vi.fn(async () => answer(200, { ok: false, description: `${FAKE_TOKEN} ${SECRET_TEXT}` })),
    ];
    for (const f of failures) {
      let error: unknown;
      try {
        await sendTelegram(CONFIG, SECRET_TEXT, { fetchImpl: f as unknown as typeof fetch });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(TelegramError);
      const e = error as Error;
      const dump = [e.message, e.stack, e.name, JSON.stringify(e), String(e), String((e as { cause?: unknown }).cause)].join("\n");
      for (const secret of [FAKE_TOKEN, "123456:", FAKE_CHAT, SECRET_TEXT]) expect(dump).not.toContain(secret);
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("callTelegram returns the result of ok:true answers", async () => {
    const f = vi.fn(async () => answer(200, { ok: true, result: [{ update_id: 1 }] }));
    await expect(callTelegram(FAKE_TOKEN, "getUpdates", {}, { fetchImpl: f as unknown as typeof fetch })).resolves.toEqual([{ update_id: 1 }]);
  });
});
