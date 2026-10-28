// npm run telegram:test
// Sends one clearly fake message ("Test message, no visitor data") through the same adapter as the lead delivery and prints
// the HTTP status and a short verdict. Refuses when the variables are missing.
import { runTest } from "./lib/telegram-commands.mjs";

process.exit(await runTest(process.env));
