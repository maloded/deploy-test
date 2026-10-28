// Self-contained like content-root.ts (the telegram scripts run it in plain Node): only the environment goes in, and the
// answer is either the settings or the NAMES of the variables that are missing or invalid. A value is never part of an answer.

type Env = Record<string, string | undefined>;

export const TELEGRAM_DETAILS = ["full", "short"];
/** "store": Telegram is where the lead is delivered (LEADS_STORE=telegram). "notifier": it only tells a chat after another store accepted the lead (LEADS_NOTIFY=telegram). */
export type TelegramRole = "store" | "notifier";
export type TelegramDetail = "full" | "short";
export type TelegramConfig = { token: string; chatId: string; detail: TelegramDetail; role: TelegramRole };
export type TelegramSetup = { ok: true; config: TelegramConfig } | { ok: false; names: string[] };

/** <bot id>:<secret>, as BotFather hands it out. */
const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;
/** A numeric chat id (negative for groups and channels) or a public channel's @username. */
const CHAT_ID = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

const read = (env: Env, name: string): string => env[name]?.trim() ?? "";

/** Whether TELEGRAM_BOT_TOKEN is set and has the right shape (the commands need the token alone). */
export const tokenOk = (env: Env): boolean => TOKEN.test(read(env, "TELEGRAM_BOT_TOKEN"));

/** What LEADS_NOTIFY asks for: nothing, Telegram, or a value this template does not know. */
export function notifyChoice(env: Env): "none" | "telegram" | "invalid" {
  const value = read(env, "LEADS_NOTIFY");
  return value === "" ? "none" : value === "telegram" ? "telegram" : "invalid";
}

/**
 * The Telegram settings for a role, or the names of what is wrong. Rules: token and chat id are required and must have the
 * right format; TELEGRAM_DETAIL is "full" or "short" and defaults to "full" for the store and "short" for the notifier (the
 * notifier sends "full" only when it is set explicitly); Telegram as the only store with "short" is refused (the lead would
 * be delivered without its contact data); Telegram as store and as notifier at once is refused (every lead would arrive twice).
 */
export function telegramSetup(env: Env, role: TelegramRole): TelegramSetup {
  const names: string[] = [];
  if (read(env, "LEADS_STORE") === "telegram" && read(env, "LEADS_NOTIFY") === "telegram") return { ok: false, names: ["LEADS_STORE", "LEADS_NOTIFY"] };
  const token = read(env, "TELEGRAM_BOT_TOKEN");
  const chatId = read(env, "TELEGRAM_CHAT_ID");
  const given = read(env, "TELEGRAM_DETAIL");
  if (!TOKEN.test(token)) names.push("TELEGRAM_BOT_TOKEN");
  if (!CHAT_ID.test(chatId)) names.push("TELEGRAM_CHAT_ID");
  const detail = given === "" ? (role === "store" ? "full" : "short") : given;
  if (!TELEGRAM_DETAILS.includes(detail) || (role === "store" && detail === "short")) names.push("TELEGRAM_DETAIL");
  if (names.length > 0) return { ok: false, names };
  return { ok: true, config: { token, chatId, detail: detail as TelegramDetail, role } };
}
