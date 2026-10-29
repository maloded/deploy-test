// npm run avatars:list [-- --json]: the avatars of <content root>/_avatars (id, name, voice, poster, loops). A broken pack is reported, not listed.
// The same data a picker reads: listAvatars() in src/lib/avatar-library.ts.
import { scanAvatars } from "../src/lib/avatar-library.ts";
import { contentRootOrExit } from "./lib/content-dir.mjs";

const { avatars, problems } = scanAvatars(contentRootOrExit());
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(avatars, null, 2));
} else if (avatars.length === 0) {
  console.log("no avatars in this content root (<content root>/_avatars/<id>/avatar.json)");
} else {
  for (const a of avatars) console.log(`${a.id}\t${a.name}\t${a.voiceHint ?? "-"}\t${a.poster}\t${a.loops.join(",") || "poster only"}`);
}
for (const p of problems) console.error(`problem: ${p}`);
process.exit(problems.length ? 1 : 0);
