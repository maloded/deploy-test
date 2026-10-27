import { handleLead } from "@/lib/lead-handler";

// Always run on the server, never prerender. The logic and its tests live in src/lib/lead-handler.ts.
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  // LEAD_CONTEXT is inlined at build time by next.config.ts, and only a literal `process.env.LEAD_CONTEXT` is replaced:
  // the host needs no content files to know the product, the languages and the consent text hashes.
  return handleLead(request, { ...process.env, LEAD_CONTEXT: process.env.LEAD_CONTEXT });
}
