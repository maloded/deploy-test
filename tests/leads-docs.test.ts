// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { LEAD_SCHEMA_VERSION, leadRecordSchema } from "@/lib/leads";
import { ownerMessage } from "@/lib/owner-message";
import { telegramText } from "@/lib/telegram";
import { FAKE_OWNER, FAKE_RECORD } from "./telegram-fakes";

const doc = fs.readFileSync("docs/LEADS.md", "utf8");
const block = (name: string): string => {
  const m = new RegExp(`<!-- ${name}:start -->\\s*\`\`\`\\w+\\n([\\s\\S]*?)\`\`\`\\s*<!-- ${name}:end -->`).exec(doc);
  if (!m) throw new Error(`docs/LEADS.md has no block ${name}`);
  return m[1].replace(/\n$/, "");
};

describe("docs/LEADS.md", () => {
  it.each([
    ["full-en", "full", "en"],
    ["full-de", "full", "de"],
    ["short-en", "short", "en"],
    ["short-de", "short", "de"],
  ] as const)("the %s example is exactly what the code produces for the fake record", (name, detail, lang) => {
    expect(block(`owner-message:${name}`)).toBe(ownerMessage(FAKE_RECORD, detail, FAKE_OWNER(lang)));
  });

  it("the fake record behind the examples is a valid lead record", () => {
    expect(leadRecordSchema.safeParse(FAKE_RECORD).success).toBe(true);
  });

  it("the request example is what the adapter would send: plain text, a fake chat id, no parse_mode, no token, nothing personal", () => {
    const body = JSON.parse(block("telegram-request"));
    expect(Object.keys(body).sort()).toEqual(["chat_id", "disable_web_page_preview", "text"]);
    expect(body.disable_web_page_preview).toBe(true);
    expect(body.text).toBe(telegramText(body.text));
    expect(body.text).toBe(ownerMessage({ ...FAKE_RECORD, type: "question", lang: "en", timezone: undefined }, "short", FAKE_OWNER("en")));
    expect(body.chat_id).toBe("-1000000000000");
    expect(JSON.stringify(body)).not.toMatch(/parse_mode|bot\d|Jane|invalid/);
  });

  it("holds no token-shaped value", () => {
    expect(doc).not.toMatch(/\b\d{6,}:[A-Za-z0-9_-]{30,}/);
  });
});

describe("docs/LEADS.md: the record", () => {
  it("the fake lead record in the docs validates and has contactWindow and no bestTime", () => {
    const record = JSON.parse(block("lead-record"));
    expect(leadRecordSchema.safeParse(record).success).toBe(true);
    expect(record.contactWindow).toBe("morning");
    expect(record).not.toHaveProperty("bestTime");
    expect(record).toEqual(JSON.parse(JSON.stringify(FAKE_RECORD)));
  });

  it("has an example of every kind of request, each a valid record of the current version, with the contact fields it can lack", () => {
    const get = (name: string) => JSON.parse(block(name)) as Record<string, unknown>;
    const examples = { viewing: get("lead-record"), testdrive: get("lead-record:testdrive"), question: get("lead-record:question"), offer: get("lead-record:offer"), agent: get("lead-record:offer-agent") };
    for (const [name, record] of Object.entries(examples)) {
      const parsed = leadRecordSchema.safeParse(record);
      expect(parsed.error?.issues ?? [], name).toEqual([]);
      expect(record.schemaVersion, name).toBe(LEAD_SCHEMA_VERSION);
    }
    expect(Object.values(examples).map((r) => r.type)).toEqual(["viewing", "testdrive", "question", "offer", "offer"]);
    expect(examples.testdrive).not.toHaveProperty("phone"); // e-mail only
    expect(examples.question).not.toHaveProperty("email"); // phone only
    expect(examples.offer).toMatchObject({ amount: 49500.5, currency: "EUR" });
    expect(examples.offer).toHaveProperty("phone");
    expect(examples.offer).toHaveProperty("email"); // an offer has both
    expect(examples.agent).toMatchObject({ source: "agent", currency: "EUR" });
    expect(examples.agent).not.toHaveProperty("amount"); // left for the call
    expect(examples.agent).not.toHaveProperty("slots");
    for (const slot of (examples.testdrive.slots as { start: string }[])) expect(slot.start).toMatch(/[+-]\d{2}:\d{2}$/); // ISO with the offset
    for (const text of Object.values(examples).map((r) => JSON.stringify(r))) expect(text).not.toMatch(/"ip"|"userAgent"|"consentText"/);
  });

  it("documents every field of the record schema in its table", () => {
    const table = doc.slice(doc.indexOf("## The lead record"), doc.indexOf("<!-- lead-record:start -->"));
    const documented = [...table.matchAll(/^\| `([^|]+)` \|/gm)].flatMap((m) => m[1].split("`, `"));
    const keys = Object.keys((leadRecordSchema as unknown as { shape: Record<string, unknown> }).shape);
    expect(keys.length).toBeGreaterThan(18);
    for (const key of keys) expect(documented, key).toContain(key);
    for (const key of documented) expect(keys, key).toContain(key);
  });
});
