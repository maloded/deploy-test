// The product's optional background music (product.json "music"): the limits, the file rule and the helpers shared by the
// schema, the loader, the media scripts and the player. Plain data and pure functions; no file access here.

export const MAX_TRACKS = 6;
/** The longest track title, per language (in characters). */
export const MAX_TITLE_CHARS = 24;
/** The largest audio file: a background track, not a recording (about 5 minutes of mp3 at 128 kbps is 5 MB). */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
/** Quiet by default: 15 % of the system volume. */
export const DEFAULT_VOLUME = 0.15;
export const AUTOSTART_MODES = ["button", "gesture"] as const;
export type Autostart = (typeof AUTOSTART_MODES)[number];
export const DEFAULT_AUTOSTART: Autostart = "button";

/** audio/<name>.mp3, .m4a, .ogg or .wav (a plain name inside the product's media/audio folder). */
export const AUDIO_FILE = /^audio\/[^/\\]+\.(mp3|m4a|ogg|wav)$/i;
export const AUDIO_FILE_MESSAGE = "must be audio/<name>.mp3, .m4a, .ogg or .wav (a file in the media/audio folder)";

/** The MIME type a browser expects for an audio file name (only used by tests and tools; the server sets its own). */
export const audioMime = (file: string): string => ({ mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav" })[file.slice(file.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

export type MusicTrack = { id: string; title: Record<string, string>; file: string; license: string };
export type MusicConfig = { tracks: MusicTrack[]; defaultTrack?: string; volume: number; autostart: Autostart };

/** The id of the track the player starts with: defaultTrack, or the first one. */
export const startTrackId = (music: Pick<MusicConfig, "tracks" | "defaultTrack">): string => music.defaultTrack ?? music.tracks[0].id;
