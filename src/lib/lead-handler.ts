import { DEFAULT_CONTACT_WINDOWS, isWindowCode } from "./contact-windows";
import { leadContext } from "./lead-context";
import { MIN_FILL_MS, validateLead } from "./lead";
import { randomUUID } from "node:crypto";
import { amountProblem } from "./offer-amount";
import { needsSlots } from "./request-types";
import { slotsProblem } from "./viewing";
import { buildRecord, checkDelivery, LeadStoreError, markNotified, notifyLead, storeKindOf, storeLead } from "./leads";
import { requestNumber } from "./owner-message";
import { leadLimiter } from "./rate-limit";

/** The largest body accepted: the longest message plus every other field is far below this. */
export const MAX_BODY_BYTES = 8 * 1024;
/** Cross-site posts cannot set this header without a CORS preflight, which this API never answers. */
export const LEAD_HEADER = "x-lead-request";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/** Generic messages only: no echo of what was sent, no internals. */
const refuse = (status: number, error: string) => json(status, { ok: false, error });

const clientOf = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";

/** Whether the request comes from this site's own pages (Origin and Sec-Fetch-Site, when the browser sends them). */
function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * POST /api/lead. In order: same-origin and custom header (403), JSON content type (415), rate limit (429), body size
 * (413), JSON (400), honeypot (a silent 200 that stores nothing), the shared schema (400 with one code per field), the
 * minimum fill time (422), the site context (503), the store (503 when none works). Only a stored lead answers 200 with
 * `{ ok: true, id }` (the request number); a notification to the seller's chat (LEADS_NOTIFY) comes after that and never changes the answer. Nothing about the visitor is logged.
 * `env` and `fetchImpl` are for tests.
 */
export async function handleLead(request: Request, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.headers.get(LEAD_HEADER) !== "1" || !sameOrigin(request)) return refuse(403, "forbidden");
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return refuse(415, "unsupported");
  if (!leadLimiter.allow(clientOf(request))) return refuse(429, "rate-limited");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return refuse(413, "too-large");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return refuse(413, "too-large");

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse(400, "invalid");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return refuse(400, "invalid");

  // the honeypot: a bot fills every field. It gets the same answer as a success and nothing is stored.
  const trap = (raw as Record<string, unknown>).website;
  if (typeof trap === "string" && trap.trim() !== "") return json(200, { ok: true, id: requestNumber(randomUUID()) }); // a request number like any other, so that a bot cannot tell

  const checked = validateLead(raw);
  if (!checked.ok) return json(400, { ok: false, error: "invalid", errors: checked.errors });
  if (checked.data.elapsedMs < MIN_FILL_MS) return refuse(422, "too-fast"); // visible: a fast person can send again

  const context = leadContext(env);
  if (!context || !context.languages.includes(checked.data.lang)) return refuse(context ? 400 : 503, context ? "invalid" : "unavailable");
  // the request type must be one this product offers (a viewing for a product without viewing settings is refused)
  if (!context.requestTypes.includes(checked.data.requestType)) return json(400, { ok: false, error: "invalid", errors: { requestType: "invalid" } });

  // the contact window must be one of the seller's codes
  if (checked.data.contactWindow !== undefined && !isWindowCode(context.contactWindows ?? DEFAULT_CONTACT_WINDOWS, checked.data.contactWindow)) {
    return json(400, { ok: false, error: "invalid", errors: { contactWindow: "invalid" } });
  }

  // viewing and test drive: every slot is checked again against the seller's settings (allowed day and hours, a future
  // day inside the horizon, the seller's calendar, daylight saving). One generic answer whatever is wrong. A request from the
  // agent may have none (Sofia arranges the time in the call); the ones it has are checked like any other.
  const slots = checked.data.preferredSlots;
  if (needsSlots(checked.data.requestType) && (slots?.length ?? 0) > 0 && (!context.viewing || slotsProblem(slots, context.viewing, new Date()) !== null)) {
    return json(400, { ok: false, error: "invalid", errors: { preferredSlots: "invalid" } });
  }

  // an offer: the amount must be inside the product's range (it has one unless the product has no price to go by)
  if (checked.data.requestType === "offer" && checked.data.amount !== undefined && amountProblem(checked.data.amount, context.offer ?? null) !== null) {
    return json(400, { ok: false, error: "invalid", errors: { amount: "amount" } });
  }

  const owner = { lang: context.defaultLanguage ?? context.languages[0], windows: context.contactWindows, productTitle: context.productTitle, price: context.price, agentName: context.agentName };
  const record = buildRecord(checked.data, context, request.headers.get("user-agent"), new Date(), randomUUID(), storeKindOf(env));
  try {
    const wrong = checkDelivery(env);
    if (wrong) throw wrong;
    await storeLead(record, env, fetchImpl, process.cwd(), owner);
  } catch (e) {
    // the reason (for example "file: EROFS" or the NAMES of bad variables) holds no personal data
    console.error(`lead not stored (${e instanceof LeadStoreError ? e.reason : "error"})`);
    return refuse(503, "unavailable");
  }
  // after the store; it cannot change the answer. A file store's record then says the chat was told.
  if (await notifyLead(record, env, fetchImpl, owner)) await markNotified(record, env);
  return json(200, { ok: true, id: record.requestNumber });
}
