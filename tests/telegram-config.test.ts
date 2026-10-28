// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FAKE_CHAT, FAKE_TOKEN } from "./telegram-fakes";
import { notifyChoice, telegramSetup } from "@/lib/telegram-config";

const GOOD = { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT };

describe("the Telegram configuration rules", () => {
  it("the store defaults to full and the notifier to short", () => {
    expect(telegramSetup({ ...GOOD, LEADS_STORE: "telegram" }, "store")).toMatchObject({ ok: true, config: { detail: "full", role: "store", chatId: FAKE_CHAT } });
    expect(telegramSetup({ ...GOOD, LEADS_STORE: "file", LEADS_NOTIFY: "telegram" }, "notifier")).toMatchObject({ ok: true, config: { detail: "short", role: "notifier" } });
  });

  it("the notifier sends full only when TELEGRAM_DETAIL=full is set explicitly", () => {
    expect(telegramSetup({ ...GOOD, LEADS_NOTIFY: "telegram", TELEGRAM_DETAIL: "full" }, "notifier")).toMatchObject({ ok: true, config: { detail: "full" } });
  });

  it("short is allowed for the notifier and refused for the only store", () => {
    expect(telegramSetup({ ...GOOD, LEADS_NOTIFY: "telegram", TELEGRAM_DETAIL: "short" }, "notifier").ok).toBe(true);
    expect(telegramSetup({ ...GOOD, LEADS_STORE: "telegram", TELEGRAM_DETAIL: "short" }, "store")).toEqual({ ok: false, names: ["TELEGRAM_DETAIL"] });
  });

  it("names the missing or invalid variables, never a value", () => {
    expect(telegramSetup({ LEADS_STORE: "telegram" }, "store")).toEqual({ ok: false, names: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] });
    expect(telegramSetup({ ...GOOD, TELEGRAM_CHAT_ID: "my group", LEADS_STORE: "telegram" }, "store")).toEqual({ ok: false, names: ["TELEGRAM_CHAT_ID"] });
    expect(telegramSetup({ ...GOOD, TELEGRAM_BOT_TOKEN: "nonsense", LEADS_STORE: "telegram" }, "store")).toEqual({ ok: false, names: ["TELEGRAM_BOT_TOKEN"] });
    expect(telegramSetup({ ...GOOD, TELEGRAM_DETAIL: "verbose", LEADS_STORE: "telegram" }, "store")).toEqual({ ok: false, names: ["TELEGRAM_DETAIL"] });
    const bad = telegramSetup({ TELEGRAM_BOT_TOKEN: "secret-value-xyz", TELEGRAM_CHAT_ID: "chat-value-xyz" }, "store");
    expect(JSON.stringify(bad)).not.toMatch(/xyz/);
  });

  it("accepts a numeric chat id and a public channel @username", () => {
    for (const chat of ["-1000000000000", "123456789", "@fake_channel_name"]) expect(telegramSetup({ ...GOOD, TELEGRAM_CHAT_ID: chat }, "store").ok, chat).toBe(true);
    for (const chat of ["12", "-", "@ab", "https://t.me/x"]) expect(telegramSetup({ ...GOOD, TELEGRAM_CHAT_ID: chat }, "store").ok, chat).toBe(false);
  });

  it("Telegram as store and as notifier at once is a configuration error naming both variables", () => {
    const both = { ...GOOD, LEADS_STORE: "telegram", LEADS_NOTIFY: "telegram" };
    expect(telegramSetup(both, "store")).toEqual({ ok: false, names: ["LEADS_STORE", "LEADS_NOTIFY"] });
    expect(telegramSetup(both, "notifier")).toEqual({ ok: false, names: ["LEADS_STORE", "LEADS_NOTIFY"] });
  });

  it("LEADS_NOTIFY is none, telegram or invalid", () => {
    expect([undefined, "", "  "].map((v) => notifyChoice({ LEADS_NOTIFY: v }))).toEqual(["none", "none", "none"]);
    expect(notifyChoice({ LEADS_NOTIFY: "telegram" })).toBe("telegram");
    expect(notifyChoice({ LEADS_NOTIFY: "email" })).toBe("invalid");
  });
});
