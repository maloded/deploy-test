// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MIN_FILL_MS, validateLead } from "@/lib/lead";
import { handleLead } from "@/lib/lead-handler";
import { leadRecordSchema, type LeadRecord } from "@/lib/leads";
import { leadLimiter } from "@/lib/rate-limit";
import { EXAMPLES_DIR, examples } from "./helpers";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "contact-window-api-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const HOUSE = examples.ref("example-house"); // Europe/Vienna
let n = 0;
const env = () => ({ CONTENT_DIR: EXAMPLES_DIR, CONTENT_PRODUCT: HOUSE, LEADS_STORE: "file", LEADS_DIR: path.join(tmp, `l${n++}`) });
const BASE = { lang: "en", requestType: "question", name: "Test Person", email: "person@example.invalid", consent: true, website: "", elapsedMs: MIN_FILL_MS + 500 };
let ip = 0;
const post = (body: unknown, e = env()) =>
  handleLead(new Request("http://localhost:3000/api/lead", { method: "POST", headers: { "content-type": "application/json", "x-lead-request": "1", host: "localhost:3000", "x-forwarded-for": `198.51.100.${(ip++ % 250) + 1}` }, body: JSON.stringify(body) }), e);
const stored = (e: Record<string, string>): LeadRecord[] => (fs.existsSync(e.LEADS_DIR) ? fs.readdirSync(e.LEADS_DIR).map((f) => JSON.parse(fs.readFileSync(path.join(e.LEADS_DIR, f), "utf8"))) : []);
beforeEach(() => leadLimiter.reset());

describe("the contact window in the lead API", () => {
  it("every default code is accepted and stored with the seller's time zone", async () => {
    for (const code of ["anytime", "morning", "afternoon", "evening"]) {
      const e = env();
      const res = await post({ ...BASE, contactWindow: code }, e);
      expect(res.status, code).toBe(200);
      const [record] = stored(e);
      expect(record).toMatchObject({ contactWindow: code, timezone: "Europe/Vienna" });
      expect(leadRecordSchema.safeParse(record).success).toBe(true);
    }
  });

  it("no window sent: the record says anytime", async () => {
    const e = env();
    await post(BASE, e);
    expect(stored(e)[0].contactWindow).toBe("anytime");
  });

  it.each(["night", "Morning", "9-12", "", "x".repeat(40)])("rejects the unknown code %j with 400 and stores nothing", async (code) => {
    const e = env();
    const res = await post({ ...BASE, contactWindow: code }, e);
    expect(res.status).toBe(400);
    expect(stored(e)).toEqual([]);
  });

  it("an unknown but well-formed code names the field", async () => {
    const res = await post({ ...BASE, contactWindow: "night" });
    expect(await res.json()).toEqual({ ok: false, error: "invalid", errors: { contactWindow: "invalid" } });
  });

  it("the schema knows contactWindow as a field", () => {
    expect(validateLead({ ...BASE, contactWindow: "morning" }).ok).toBe(true);
    const r = validateLead({ ...BASE, contactWindow: "Not A Code" });
    expect(!r.ok && r.errors.contactWindow).toBeTruthy();
  });
});
