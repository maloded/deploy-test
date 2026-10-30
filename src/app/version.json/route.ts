import { prototypeNoteEnabled } from "@/lib/review";
import { currentVersion } from "@/lib/version";

// Static: the JSON is inlined at build time (VERSION_INFO), so the version of a deployment can be read without a browser. Only where the
// prototype note is on (NEXT_PUBLIC_PROTOTYPE_NOTE, also fixed at build time): a release does not publish its version and commit hashes.
export const dynamic = "force-static";

export function GET() {
  if (!prototypeNoteEnabled()) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return Response.json(currentVersion() ?? { version: "dev" });
}
