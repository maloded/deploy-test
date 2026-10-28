// Self-contained like content-root.ts (the telegram scripts run it in plain Node): no path aliases, no TypeScript-only
// syntax beyond annotations. The Telegram Bot API through fetch, and nothing else. The token is part of the URL, and the chat
// id and the text are the lead: none of the three ever reaches a log, an error message or a thrown object (every failure is
// wrapped into a TelegramError that carries a generic reason such as "5xx" or "network").
import type { TelegramConfig } from "./telegram-config.ts";

export const TELEGRAM_API = "https://api.telegram.org";
/** Telegram accepts 4096 characters; the rest is headroom. */
export const MAX_TEXT = 3800;
/** The whole call, the retry included. */
export const STORE_TIMEOUT_MS = 8000;
/** The notifier waits less: the visitor is waiting for the answer. */
export const NOTIFY_TIMEOUT_MS = 4000;

/** A failure with a reason that holds no data: "network", "timeout", "4xx", "5xx" or "answer". */
export class TelegramError extends Error {
  reason: string;
  /** The HTTP status when Telegram answered with one. */
  status?: number;
  constructor(reason: string, status?: number) {
    super(`telegram: ${reason}`);
    this.name = "TelegramError";
    this.reason = reason;
    this.status = status;
  }
}

export type TelegramOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** For tests and the mock server of the commands; the real API is the default. */
  apiBase?: string;
};

/** Control, zero-width and line-separator characters, written as escapes so the source stays readable; the line break (\u000a) is not among them. */
const CONTROL = new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]", "g");

/** Plain text: control characters (except the line break) removed, tabs as spaces, at most MAX_TEXT characters. */
export function telegramText(text: string): string {
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(CONTROL, "");
  if (clean.length <= MAX_TEXT) return clean;
  const cut = clean.slice(0, MAX_TEXT - 1);
  return (/[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut) + "…";
}

const statusClass = (status: number): string => (status >= 500 ? "5xx" : status >= 400 ? "4xx" : status >= 300 ? "3xx" : "answer");

/**
 * Calls one method of the Bot API with a JSON body and returns its `result` (only when Telegram answers ok:true). One retry,
 * and only after a network error (a failed connection); an HTTP status, a timeout or an answer that is not ok:true is final.
 * The timeout covers the retry too.
 */
export async function callTelegram(token: string, method: string, payload: Record<string, unknown>, options: TelegramOptions = {}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${options.apiBase ?? TELEGRAM_API}/bot${token}/${method}`;
  const signal = AbortSignal.timeout(options.timeoutMs ?? STORE_TIMEOUT_MS);
  let res: Response | undefined;
  for (let attempt = 0; res === undefined; attempt++) {
    try {
      res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), redirect: "error", signal });
    } catch (e) {
      const name = (e as Error | null)?.name;
      if (name === "TimeoutError" || name === "AbortError" || signal.aborted) throw new TelegramError("timeout");
      if (attempt >= 1) throw new TelegramError("network"); // the error text may hold the URL, and so the token
    }
  }
  let body = null as { ok?: unknown; result?: unknown } | null;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = null;
  }
  if (!res.ok) throw new TelegramError(statusClass(res.status), res.status);
  if (body?.ok !== true) throw new TelegramError("answer", res.status);
  return body.result;
}

/** Sends one plain-text message (no parse_mode, so nothing needs escaping, and no link preview). Delivered only when Telegram answers ok:true. */
export async function sendTelegram(config: Pick<TelegramConfig, "token" | "chatId">, text: string, options: TelegramOptions = {}): Promise<void> {
  await callTelegram(config.token, "sendMessage", { chat_id: config.chatId, text: telegramText(text), disable_web_page_preview: true }, options);
}
