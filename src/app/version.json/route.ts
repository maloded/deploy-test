import { currentVersion } from "@/lib/version";

// Static: the JSON is inlined at build time (VERSION_INFO), so the version of a deployment can be read without a browser.
export const dynamic = "force-static";

export function GET() {
  return Response.json(currentVersion() ?? { version: "dev" });
}
