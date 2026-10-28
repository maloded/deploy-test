// Generates the tiny test audio of the example product (no real music: two quiet sine tones with a fade, 8-bit mono WAV,
// about 4 KB each). They are valid files a browser can decode, so the player's code path (play, loop, switch track) is real.
// Usage: node scripts/make-test-audio.mjs [outDir]   (default: examples/example-seller/example-house/media/audio)
import fs from "node:fs";
import path from "node:path";

const RATE = 8000;
const SECONDS = 0.5;

/** An 8-bit unsigned mono PCM WAV of a sine tone, faded in and out so a loop has no click. */
export function sineWav(frequency, seconds = SECONDS, rate = RATE) {
  const count = Math.round(rate * seconds);
  const data = Buffer.alloc(count);
  const fade = Math.round(rate * 0.05);
  for (let i = 0; i < count; i++) {
    const edge = Math.min(1, i / fade, (count - 1 - i) / fade);
    data[i] = Math.round(128 + 127 * 0.25 * edge * Math.sin((2 * Math.PI * frequency * i) / rate));
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + count, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16); // PCM header size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28); // byte rate (1 byte per sample)
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(count, 40);
  return Buffer.concat([header, data]);
}

export const TEST_TRACKS = { calm: 220, soft: 330 };

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "examples", "example-seller", "example-house", "media", "audio"));
  fs.mkdirSync(out, { recursive: true });
  for (const [name, frequency] of Object.entries(TEST_TRACKS)) {
    fs.writeFileSync(path.join(out, `${name}.wav`), sineWav(frequency));
    console.log(`${path.join(out, `${name}.wav`)}: ${sineWav(frequency).length} bytes`);
  }
}
