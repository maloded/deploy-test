// The two Telegram helper commands (npm run telegram:chats, npm run telegram:test). They read the token and the chat id from
// the environment (the launcher loads .env.local) and print neither, nor message texts, nor user names.
import { callTelegram, sendTelegram, telegramText, TelegramError } from "../../src/lib/telegram.ts";
import { telegramSetup, tokenOk } from "../../src/lib/telegram-config.ts";

export const TEST_TEXT = "Test message, no visitor data";

/** What an HTTP status means for the person running the command (the status only: Telegram's own description is never printed). */
export function verdict(status, reason) {
  if (reason === "timeout") return "No answer in time. Check the network and try again.";
  if (reason === "network") return "Telegram could not be reached. Check the network and try again.";
  if (status === 401) return "The bot token is wrong or was revoked.";
  if (status === 400) return "Telegram refused the request: the chat id is wrong, or the bot has no access to that chat.";
  if (status === 403) return "The bot may not write to that chat (it was removed, blocked or is not a member).";
  if (status === 404) return "Telegram does not know this bot token.";
  if (status === 409) return "A webhook is set on this bot, so it cannot be read with getUpdates.";
  if (status === 429) return "Telegram asks to slow down. Try again in a moment.";
  if (status >= 500) return "Telegram has a problem. Try again later.";
  return "Telegram did not accept the message.";
}

/** Chats seen in the updates: id, type and (groups and channels only) the title. Nothing else is read from an update. */
export function chatsOf(updates) {
  const seen = new Map();
  for (const u of updates) {
    for (const chat of [u?.message?.chat, u?.edited_message?.chat, u?.channel_post?.chat, u?.edited_channel_post?.chat, u?.my_chat_member?.chat, u?.chat_member?.chat, u?.callback_query?.message?.chat]) {
      if (!chat || typeof chat.id !== "number" || seen.has(chat.id)) continue;
      const group = chat.type !== "private"; // a private chat's "title" would be a person's name: never read
      seen.set(chat.id, { id: chat.id, type: String(chat.type ?? "?"), title: group && typeof chat.title === "string" ? telegramText(chat.title).replace(/\n/g, " ").slice(0, 60) : "" });
    }
  }
  return [...seen.values()];
}

const HINT_PRIVACY = [
  "Bots in groups only see commands and mentions by default (privacy mode).",
  "Send /start@<botname> in the group (the bot must be a member), then run this command again.",
  "If the group still does not show up: make the bot an admin of the group, or disable privacy mode in BotFather (/setprivacy, then Disable) and remove and add the bot again.",
];

/** npm run telegram:chats. Returns the exit code. `io` and `options` are for tests. */
export async function runChats(env, io = { out: console.log, err: console.error }, options = {}) {
  if (!tokenOk(env)) {
    io.err("TELEGRAM_BOT_TOKEN is missing or not valid. Set it in .env.local (see .env.example).");
    return 1;
  }
  const token = env.TELEGRAM_BOT_TOKEN.trim();
  try {
    const me = await callTelegram(token, "getMe", {}, options);
    const botname = typeof me?.username === "string" ? me.username : "<botname>";
    const hook = await callTelegram(token, "getWebhookInfo", {}, options);
    if (typeof hook?.url === "string" && hook.url !== "") {
      io.out("A webhook is set on this bot, so Telegram does not hand out updates and the chats cannot be listed here.");
      io.out("Remove the webhook first (deleteWebhook) only if nothing else uses this bot, then run this command again.");
      return 0;
    }
    const updates = await callTelegram(token, "getUpdates", { limit: 100, timeout: 0 }, options);
    const chats = chatsOf(Array.isArray(updates) ? updates : []);
    const groups = chats.filter((c) => c.type !== "private");
    if (groups.length > 0) {
      io.out("id\ttype\ttitle");
      for (const c of groups) io.out(`${c.id}\t${c.type}\t${c.title}`);
      io.out(`Set TELEGRAM_CHAT_ID to the id of the chat that should receive the requests.`);
      return 0;
    }
    io.out(chats.length === 0 ? "The bot has no updates." : "The bot has updates, but none from a group or channel: it may not be a member of any.");
    for (const line of HINT_PRIVACY) io.out(line.replace("<botname>", botname));
    return 0;
  } catch (e) {
    io.err(`Telegram answered with an error (${e instanceof TelegramError ? e.reason : "error"}). ${e instanceof TelegramError ? verdict(e.status, e.reason) : ""}`.trim());
    return 1;
  }
}

/** npm run telegram:test. Returns the exit code. */
export async function runTest(env, io = { out: console.log, err: console.error }, options = {}) {
  // the detail does not matter for a test message, and neither does the store
  const setup = telegramSetup({ ...env, LEADS_STORE: undefined, LEADS_NOTIFY: undefined, TELEGRAM_DETAIL: undefined }, "notifier");
  if (!setup.ok) {
    io.err(`Not sending: ${setup.names.join(", ")} missing or not valid. Set them in .env.local (see .env.example).`);
    return 1;
  }
  try {
    await sendTelegram(setup.config, TEST_TEXT, options);
    io.out("HTTP 200: Telegram accepted the test message. Delivery works.");
    return 0;
  } catch (e) {
    const status = e instanceof TelegramError ? e.status : undefined;
    io.err(`${status ? `HTTP ${status}` : "No HTTP answer"}: ${verdict(status, e instanceof TelegramError ? e.reason : "error")}`);
    return 1;
  }
}
