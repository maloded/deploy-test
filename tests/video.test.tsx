// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary parts of a loaded product */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { renderedBlocks, type Site } from "@/components/blocks";
import { Video } from "@/components/Video";
import { VideoFacade } from "@/components/VideoFacade";
import { embedUrl, parseVideo } from "@/lib/video";
import { validateProduct } from "@/lib/validate";
import { loadLayout } from "@/product-types/layouts";
import { fixtures, sampleJson, siteFor } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const poster = { src: `/media/${fixtures.ref("fixture-car")}/poster.jpg`, width: 640, height: 360 };

function withVideo(video: string | null, withPoster = true): Site {
  const site = siteFor("fixture-car");
  const product = structuredClone(site.product) as any;
  product.media.video = video;
  if (withPoster) product.media.videoPoster = "poster.jpg";
  return { ...site, product, images: { ...site.images, "poster.jpg": poster } };
}
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("parseVideo", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads the YouTube id from %s", (url, id) => {
    expect(parseVideo(url)).toEqual({ kind: "youtube", id });
  });

  it.each([
    ["https://vimeo.com/76979871", "76979871"],
    ["https://player.vimeo.com/video/76979871", "76979871"],
    ["https://www.vimeo.com/76979871?h=abc", "76979871"],
  ])("reads the Vimeo id from %s", (url, id) => {
    expect(parseVideo(url)).toEqual({ kind: "vimeo", id });
  });

  it("accepts mp4 and webm file names", () => {
    expect(parseVideo("clip.mp4")).toEqual({ kind: "file", file: "clip.mp4", type: "video/mp4" });
    expect(parseVideo("Clip.WEBM")).toEqual({ kind: "file", file: "Clip.WEBM", type: "video/webm" });
  });

  it.each([
    ["https://example.com/video.mp4", /unknown video host "example\.com"/],
    ["https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", /unknown video host/],
    ["https://www.youtube.com/watch", /no YouTube video id/],
    ["https://vimeo.com/channels/staffpicks", /no Vimeo video id/],
    ["clip.mov", /not a URL or an mp4\/webm file name/],
    ["folder/clip.mp4", /not a URL or an mp4\/webm file name/],
  ])("rejects %s with a clear message", (value, message) => {
    const r = parseVideo(value);
    expect("error" in r && r.error).toMatch(message);
    expect("error" in r && r.error).toMatch(/Use a YouTube or Vimeo URL, or an mp4\/webm file name in media\//);
  });

  it("builds privacy-friendly embed addresses", () => {
    expect(embedUrl({ kind: "youtube", id: "dQw4w9WgXcQ" })).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(embedUrl({ kind: "vimeo", id: "76979871" })).toBe("https://player.vimeo.com/video/76979871?dnt=1&autoplay=1");
  });
});

describe("validation", () => {
  const issues = (video: string | null) => {
    const p = sampleJson("fixture-car");
    p.media.video = video;
    const r = validateProduct(p);
    return r.ok ? [] : r.issues;
  };

  it("rejects an unknown host in product.json with the field path", () => {
    expect(issues("https://example.com/v")).toEqual([expect.stringMatching(/^media\.video: unknown video host "example\.com"/)]);
  });

  it("accepts null, YouTube, Vimeo and local files", () => {
    for (const v of [null, YT, "https://vimeo.com/76979871", "clip.mp4", "clip.webm"]) expect(issues(v)).toEqual([]);
  });
});

describe("video block", () => {
  it("renders nothing without media.video and drops out of the block order", () => {
    const site = withVideo(null);
    expect(html(<Video site={site} />)).toBe("");
    expect(renderedBlocks(site)).not.toContain("video");
  });

  it("renders a click-to-load facade for YouTube: poster and button, no iframe, no third-party address", () => {
    const out = html(<Video site={withVideo(YT)} />);
    expect(out).toContain('data-block="video"');
    expect(out).toContain('class="video__facade"');
    expect(out).toContain("poster.jpg"); // a local poster, never a remote thumbnail
    expect(out).not.toContain("<iframe");
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).not.toMatch(/youtube|vimeo/i);
  });

  it("does the same for Vimeo, also without a poster", () => {
    const out = html(<Video site={withVideo("https://vimeo.com/76979871", false)} />);
    expect(out).toContain("video__facade");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<iframe");
    expect(out).not.toMatch(/https?:\/\//);
  });

  it("renders a plain <video> for a local file, with a poster, controls and no autoplay", () => {
    const out = html(<Video site={withVideo("clip.mp4")} />);
    expect(out).toContain("<video");
    expect(out).toContain("controls");
    expect(out).toContain('preload="metadata"');
    expect(out).toMatch(/playsinline/i); // server markup spells it playsInline=""; HTML attribute names are case-insensitive
    expect(out).toContain(`poster="/media/${fixtures.ref("fixture-car")}/poster.jpg"`);
    expect(out).toContain(`<source src="/media/${fixtures.ref("fixture-car")}/clip.mp4" type="video/mp4"/>`);
    expect(out).not.toMatch(/autoplay/i);
    expect(out).not.toContain("<iframe");
  });

  it("is in the page after the gallery, in the block order", async () => {
    const site = withVideo(YT);
    const Layout = await loadLayout("car");
    const out = html(<Layout site={site} />);
    expect(out).toContain('data-block-order="hero gallery video specs offer faq contact"');
    expect(out.indexOf('id="gallery"')).toBeLessThan(out.indexOf('id="video"'));
    expect(out.indexOf('id="video"')).toBeLessThan(out.indexOf('id="specs"'));
    expect(out).not.toContain("<iframe");
  });
});

describe("facade (client)", () => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  function mount(el: React.ReactElement) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(el));
  }

  it("creates the YouTube iframe only after the click, on the nocookie domain", () => {
    mount(<VideoFacade embed={embedUrl({ kind: "youtube", id: "dQw4w9WgXcQ" })} title="Video player: Car" lang="en" poster={poster} />);
    expect(container.querySelector("iframe")).toBeNull();
    const button = container.querySelector("button.video__facade") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Play video: Video player: Car");
    act(() => void button.click());
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(frame.src).not.toContain("youtube.com/");
    expect(frame.title).toBe("Video player: Car");
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(container.querySelector("button.video__facade")).toBeNull();
    expect(document.activeElement).toBe(frame);
  });

  it("uses dnt=1 for Vimeo", () => {
    mount(<VideoFacade embed={embedUrl({ kind: "vimeo", id: "76979871" })} title="t" lang="en" poster={null} />);
    act(() => void (container.querySelector("button") as HTMLButtonElement).click());
    expect((container.querySelector("iframe") as HTMLIFrameElement).src).toBe("https://player.vimeo.com/video/76979871?dnt=1&autoplay=1");
  });
});
