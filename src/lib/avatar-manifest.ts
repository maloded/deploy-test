// The voice agent's avatar packs: the manifest (<content root>/_avatars/<id>/avatar.json), its limits and the pure helpers shared
// by the loader, the media scripts, the snapshot and the card. No file access here (see avatar-library.ts) and no path aliases,
// so the app, the scripts (plain Node) and the tests import this one file.
import { z } from "zod";
import type { Language } from "./languages";
import type { Localized } from "./schema";

/** The folder of the shared library inside the content root. A seller folder can never be named like this (see PART in content-root.ts). */
export const AVATARS_DIR = "_avatars";
/** The largest video of a pack: a short loop, not a film (same idea as MAX_AUDIO_BYTES for a music track). */
export const MAX_AVATAR_VIDEO_BYTES = 4 * 1024 * 1024;
/** The largest poster: it is the first thing the card shows, so it must be light. */
export const MAX_AVATAR_POSTER_BYTES = 300 * 1024;
/** The loops a pack can have, in the order the card stacks them. `invite` is the one played before a call, `idle` its fallback. */
export const AVATAR_SLOTS = ["invite", "idle", "listen", "speak"] as const;
export type AvatarSlot = (typeof AVATAR_SLOTS)[number];
export const VOICE_HINTS = ["female", "male", "neutral"] as const;

const NAME = "[A-Za-z0-9][A-Za-z0-9._-]{0,80}";
/** A plain file name inside the pack's folder (no folder, no path). */
export const AVATAR_VIDEO_FILE = new RegExp(`^${NAME}\\.(mp4|webm)$`, "i");
const MP4_FILE = new RegExp(`^${NAME}\\.mp4$`, "i");
const WEBM_FILE = new RegExp(`^${NAME}\\.webm$`, "i");
export const AVATAR_POSTER_FILE = new RegExp(`^${NAME}\\.webp$`, "i");
export const AVATAR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const videoFile = z.string().regex(AVATAR_VIDEO_FILE, "must be a plain file name ending in .mp4 or .webm");
/**
 * One loop: a single file, or one file per format ({ "mp4": ..., "webm": ... }). The card loads exactly one of them, never both.
 * The keys decide the format, so a name must end like its key.
 */
const loopSchema = z.union([
  videoFile,
  z
    .object({
      mp4: z.string().regex(MP4_FILE, "must be a plain file name ending in .mp4").optional(),
      webm: z.string().regex(WEBM_FILE, "must be a plain file name ending in .webm").optional(),
    })
    .strict()
    .refine((l) => l.mp4 !== undefined || l.webm !== undefined, "needs an mp4 or a webm file"),
]);

/** When the call bubble is up, in seconds of the invite loop's own time: from `show` up to (not including) `hide`. */
export const inviteCueSchema = z
  .object({ show: z.number().min(0).max(600), hide: z.number().min(0).max(600) })
  .strict()
  .refine((c) => c.hide > c.show, "hide must be later than show");
export type InviteCue = z.infer<typeof inviteCueSchema>;

/**
 * The invite loop: the same as any loop (a file, or one file per format) plus an optional `cue`, which is only possible in the object form:
 * { "mp4": "invite.mp4", "webm": "invite.webm", "cue": { "show": 0.58, "hide": 2.45 } }.
 */
const inviteSchema = z.union([
  videoFile,
  z
    .object({
      mp4: z.string().regex(MP4_FILE, "must be a plain file name ending in .mp4").optional(),
      webm: z.string().regex(WEBM_FILE, "must be a plain file name ending in .webm").optional(),
      cue: inviteCueSchema.optional(),
    })
    .strict()
    .refine((l) => l.mp4 !== undefined || l.webm !== undefined, "needs an mp4 or a webm file"),
]);

export const avatarManifestSchema = z
  .object({
    schema: z.literal(1),
    id: z.string().regex(AVATAR_ID, "lowercase letters, digits and dashes only").max(60),
    /** The name a person sees in a picker (and the card's accessible name). */
    name: z.string().trim().min(1).max(60),
    voiceHint: z.enum(VOICE_HINTS).optional(),
    /** Required: the static card, and what shows while nothing else is loaded. A .webp file. */
    poster: z.string().regex(AVATAR_POSTER_FILE, "must be a plain file name ending in .webp"),
    /** The loop played before a call (and again after one); it replaces `idle` in that role, which stays as the fallback. */
    invite: inviteSchema.optional(),
    idle: loopSchema.optional(),
    listen: loopSchema.optional(),
    speak: loopSchema.optional(),
    /** Who made it and under which licence it may be used. */
    license: z.string().trim().min(1).max(200),
    /** Where the material comes from (a person's name is fine here, a client's is not: this is a shared library). */
    provenance: z.string().trim().min(1).max(400),
  })
  .strict();
export type AvatarManifest = z.infer<typeof avatarManifestSchema>;

/** The formats of one loop: the file names by container. */
export type LoopFiles = { mp4?: string; webm?: string };

/** The file(s) of a loop, by container, or null when the pack has no such loop. */
export function loopFiles(manifest: AvatarManifest, slot: AvatarSlot): LoopFiles | null {
  const loop = manifest[slot];
  if (loop === undefined) return null;
  if (typeof loop !== "string") return { ...(loop.mp4 !== undefined ? { mp4: loop.mp4 } : {}), ...(loop.webm !== undefined ? { webm: loop.webm } : {}) }; // the cue is not a file
  return /\.webm$/i.test(loop) ? { webm: loop } : { mp4: loop };
}

/** The cue of the invite loop, or null (no invite loop, a plain file name, or no cue). */
export const inviteCue = (manifest: AvatarManifest): InviteCue | null => (manifest.invite !== undefined && typeof manifest.invite !== "string" ? (manifest.invite.cue ?? null) : null);

/** The loops a pack has, in stacking order. */
export const avatarLoops = (manifest: AvatarManifest): AvatarSlot[] => AVATAR_SLOTS.filter((slot) => manifest[slot] !== undefined);

/** Every file of a pack that must travel with it: the poster and each loop file, once, relative to the pack's folder. */
export function avatarFiles(manifest: AvatarManifest): string[] {
  const files = [manifest.poster];
  for (const slot of AVATAR_SLOTS) {
    const f = loopFiles(manifest, slot);
    if (f) files.push(...[f.mp4, f.webm].filter((x): x is string => x !== undefined));
  }
  return [...new Set(files)];
}

/** Where a pack's file is served from (npm run images copies the selected packs there). */
export const avatarUrl = (id: string, file: string): string => `/avatars/${id}/${file}`;

/** What a picker needs of a pack (see listAvatars). `poster` is a file name inside the pack; `loops` the slots that have a video. */
export type AvatarListing = { id: string; name: string; voiceHint: (typeof VOICE_HINTS)[number] | null; poster: string; loops: AvatarSlot[] };

/** The icon in the start button: "orb" (default, the glowing orb of the Hanc call card), the status "dot" or a car "wheel". */
export const BUTTON_ICONS = ["orb", "dot", "wheel"] as const;
export type ButtonIcon = (typeof BUTTON_ICONS)[number];

/** The example call on the card (agent.avatar.example in seller.json): who speaks, per line, and the limits of a text. */
export const EXAMPLE_SPEAKERS = ["agent", "caller"] as const;
export const MAX_EXAMPLE_LINES = 8;
export const MAX_EXAMPLE_TEXT = 200;
export type ExampleLine = { speaker: (typeof EXAMPLE_SPEAKERS)[number]; text: string };
/** One example call per language (the loader completes the offered languages with the default language's call). */
export type ExampleCall = Partial<Record<Language, ExampleLine[]>>;

/** A loop for the card: the URL(s) by container. The card picks one container and loads only that. */
export type ResolvedLoop = LoopFiles;
/** The pack as the card gets it (plain data, safe to hand to a client component): URLs, no file system. */
export type ResolvedAvatar = {
  id: string;
  /** The accessible name of the card: the seller's override or the pack's name. */
  name: string;
  poster: string;
  /** The loop played before a call; null: the idle loop (or the poster) plays then. */
  invite: ResolvedLoop | null;
  /** When the call bubble is up in the invite loop; null: no bubble. */
  inviteCue: InviteCue | null;
  idle: ResolvedLoop | null;
  listen: ResolvedLoop | null;
  speak: ResolvedLoop | null;
  /** The caption over the foot of the card (agent.avatar.tagline and .badge in seller.json, completed with the default language); null when the seller wrote neither. */
  caption: { tagline: Localized | null; badge: Localized | null } | null;
  /** The start and end button labels from seller.json (agent.avatar.startLabel / .endLabel); null: the page's standard labels. */
  startLabel: Localized | null;
  endLabel: Localized | null;
  /** The icon in the start button (agent.avatar.buttonIcon). */
  buttonIcon: ButtonIcon;
  /** What the call bubble says (agent.avatar.bubble); null: the page's standard text. */
  bubble: Localized | null;
  /** The job line under the name (agent.avatar.role); null: the line shows the languages only. */
  role: Localized | null;
  /** The languages the seller offers, in the order of seller.json: the line under the name ends with their own names. */
  languages: Language[];
  /** The example call shown on the large card (agent.avatar.example); null: the card has no transcript block. */
  example: ExampleCall | null;
  /** The sentence under "Live call" while a call runs (agent.avatar.liveText, {name} is replaced); null: the page's standard sentence. */
  liveText: Localized | null;
};

/** The manifest turned into URLs. `nameOverride` is agent.avatar.name from seller.json, `texts` its tagline and badge. */
export function resolveAvatar(manifest: AvatarManifest, nameOverride?: string, texts: { tagline?: Localized; badge?: Localized; startLabel?: Localized; endLabel?: Localized; buttonIcon?: ButtonIcon; role?: Localized; languages?: Language[]; example?: ExampleCall; bubble?: Localized; liveText?: Localized } = {}): ResolvedAvatar {
  const url = (f: LoopFiles | null): ResolvedLoop | null => {
    if (!f) return null;
    return { ...(f.mp4 ? { mp4: avatarUrl(manifest.id, f.mp4) } : {}), ...(f.webm ? { webm: avatarUrl(manifest.id, f.webm) } : {}) };
  };
  return {
    id: manifest.id,
    name: nameOverride ?? manifest.name,
    poster: avatarUrl(manifest.id, manifest.poster),
    invite: url(loopFiles(manifest, "invite")),
    inviteCue: inviteCue(manifest),
    idle: url(loopFiles(manifest, "idle")),
    listen: url(loopFiles(manifest, "listen")),
    speak: url(loopFiles(manifest, "speak")),
    caption: texts.tagline || texts.badge ? { tagline: texts.tagline ?? null, badge: texts.badge ?? null } : null,
    startLabel: texts.startLabel ?? null,
    endLabel: texts.endLabel ?? null,
    buttonIcon: texts.buttonIcon ?? "orb",
    bubble: texts.bubble ?? null,
    role: texts.role ?? null,
    languages: texts.languages ?? [],
    example: texts.example ?? null,
    liveText: texts.liveText ?? null,
  };
}
