// npm run telegram:chats
// Lists the chats the bot has seen (id, type, and the title of a group or channel) so you can fill TELEGRAM_CHAT_ID. It never
// prints message texts or user names, and not the token.
import { runChats } from "./lib/telegram-commands.mjs";

process.exit(await runChats(process.env));
