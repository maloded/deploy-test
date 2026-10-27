// npm run images: web-sized copies of <content root>/<slug>/media in public/media (content root: CONTENT_DIR, default ./content). Originals are never changed.
import path from "node:path";
import { contentRootOrExit } from "./lib/content-dir.mjs";
import { makeWebImages } from "./lib/web-images.mjs";

const root = process.cwd();
const results = await makeWebImages({
  contentDir: contentRootOrExit(),
  outDir: path.join(root, "public", "media"),
  log: console.log,
});
const count = (a) => results.filter((r) => r.action === a).length;
console.log(`web images: ${count("resized")} resized, ${count("cached")} cached, ${count("copied")} copied as they are`);
