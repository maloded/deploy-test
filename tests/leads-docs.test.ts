// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { leadRecordSchema } from "@/lib/leads";
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
    expect(body.text).toBe(ownerMessage({ ...FAKE_RECORD, requestType: "question", lang: "en", timezone: undefined }, "short", FAKE_OWNER("en")));
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
});
