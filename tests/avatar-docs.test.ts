import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AVATAR_SLOTS, MAX_AVATAR_POSTER_BYTES, MAX_AVATAR_VIDEO_BYTES } from "@/lib/avatar-manifest";

const docs = fs.readFileSync(path.join(process.cwd(), "docs", "PAGE-API.md"), "utf8");
const section = docs.slice(docs.indexOf("## The avatar card"), docs.indexOf("## What is NOT possible yet"));

describe("the avatar documentation", () => {
  it("has its section, with the fields, the pack format and the degradation table", () => {
    expect(section.length).toBeGreaterThan(1000);
    for (const word of ["agent.avatar", "_avatars", "avatar.json", "voiceHint", "license", "provenance", ...AVATAR_SLOTS]) expect(section).toContain(word);
    expect(section).toMatch(/\| poster only \|/);
    expect(section).toMatch(/\| one loop/);
  });

  it("states the limits the code enforces", () => {
    expect(section).toContain(`${MAX_AVATAR_VIDEO_BYTES / 1048576} MB`);
    expect(section).toContain(`${MAX_AVATAR_POSTER_BYTES / 1024} KB`);
  });

  it("says that agent_state is unconfirmed, and that the page starts no call itself", () => {
    expect(section).toMatch(/agent_state` is unconfirmed/);
    expect(section).toMatch(/no `toggleCall\(\)`, no `callManager`/);
  });

  it("says what a constructor needs, and keeps the console recipe in the docs only", () => {
    expect(section).toMatch(/What a site constructor will need/);
    expect(section).toContain("listAvatars");
    const src = ["src/components/AgentAvatarCard.tsx", "src/components/AgentWidget.tsx", "src/lib/agent-state.ts"].map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf8")).join("\n");
    expect(src).not.toContain("dispatchEvent(new CustomEvent(\"agent-command\"");
  });
});
