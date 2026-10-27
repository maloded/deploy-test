import fs from "node:fs";

export type ImageSize = { width: number; height: number };

/** Reads width and height from the file header. PNG, JPEG, WebP, GIF and SVG are supported. */
export function readImageSize(file: string): ImageSize {
  return parseImageSize(fs.readFileSync(file), file);
}

/** EXIF orientation (1-8) from a TIFF block starting at `tiff`, or undefined. */
function exifOrientation(buf: Buffer, tiff: number): number | undefined {
  if (tiff + 8 > buf.length) return undefined;
  const little = buf.toString("ascii", tiff, tiff + 2) === "II";
  const u16 = (o: number) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > buf.length) return undefined;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > buf.length) return undefined;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return undefined;
}

export function parseImageSize(buf: Buffer, label = "image"): ImageSize {
  const fail = () => new Error(`Cannot read the size of ${label}: unsupported or damaged image`);

  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf.length > 10 && buf[0] === 0xff && buf[1] === 0xd8) {
    let orientation = 1;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xe1 && buf.toString("ascii", i + 4, i + 8) === "Exif") {
        orientation = exifOrientation(buf, i + 10) ?? orientation;
      }
      // SOF0..SOF15, except DHT (c4), JPG (c8) and DAC (cc)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        const size = { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        // EXIF orientations 5-8 mean the picture is shown rotated by 90 degrees (browsers and next/image apply it)
        return orientation >= 5 && orientation <= 8 ? { width: size.height, height: size.width } : size;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    throw fail();
  }

  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    throw fail();
  }

  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  const head = buf.toString("utf8", 0, Math.min(buf.length, 2048));
  const svg = /<svg\b[^>]*>/i.exec(head);
  if (svg) {
    const attr = (name: string) => new RegExp(`\\s${name}=["']\\s*([\\d.]+)(?:px)?\\s*["']`, "i").exec(svg[0])?.[1];
    const w = attr("width");
    const h = attr("height");
    if (w && h) return { width: Math.round(Number(w)), height: Math.round(Number(h)) };
    const vb = /viewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*["']/i.exec(svg[0]);
    if (vb) return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  }

  throw fail();
}
