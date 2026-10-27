// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Gallery, type GalleryChangeDetail, type GalleryElement } from "@/components/Gallery";
import { galleryProps } from "@/components/gallery-props";
import { siteFor } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const props = galleryProps(siteFor("fixture-car"));
let root: Root;
let container: HTMLDivElement;

function mount(el: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(el));
}
const section = () => container.querySelector("#gallery") as GalleryElement;
const counter = () => container.querySelector(".gallery__counter")?.textContent;
const live = () => container.querySelector("[data-gallery-live]")?.textContent;
const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })));
const reducedMotion = (matches: boolean) =>
  (window.matchMedia = (() => ({ matches, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any);

beforeEach(() => {
  window.location.hash = "";
  reducedMotion(false);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

describe("gallery rendering", () => {
  it("renders every photo as a labelled slide with a counter, alt texts and focus positions", () => {
    mount(<Gallery {...props} />);
    const el = section();
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-roledescription")).toBe("carousel");
    expect(el.getAttribute("aria-label")).toBe("Photo gallery");
    expect(el.getAttribute("data-block")).toBe("gallery");

    const slides = [...el.querySelectorAll(".gallery__slide")];
    expect(slides).toHaveLength(5);
    expect(slides.map((s) => s.getAttribute("aria-label"))).toEqual(["1 of 5", "2 of 5", "3 of 5", "4 of 5", "5 of 5"]);
    expect(slides.every((s) => s.getAttribute("role") === "group")).toBe(true);
    expect(counter()).toBe("1 / 5");

    const imgs = slides.map((s) => s.querySelector("img") as HTMLImageElement);
    expect(imgs[0].alt).toBe("Fixture photo one");
    expect(imgs[1].style.objectPosition).toBe("25% 75%"); // photo 2 has a focus point
    expect(imgs[4].style.objectPosition).toBe("50% 60%");
    expect(imgs[0].style.objectPosition).toBe(""); // no focus: centred by default
    // stable box: every image has width and height
    expect(imgs.every((i) => i.getAttribute("width") && i.getAttribute("height"))).toBe(true);
  });

  it("labels the buttons from the UI strings and disables previous on the first photo", () => {
    mount(<Gallery {...props} />);
    const prev = container.querySelector(".gallery__nav--prev") as HTMLButtonElement;
    const next = container.querySelector(".gallery__nav--next") as HTMLButtonElement;
    expect(prev.getAttribute("aria-label")).toBe("Previous photo");
    expect(next.getAttribute("aria-label")).toBe("Next photo");
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect([...container.querySelectorAll(".gallery__thumb")].map((t) => t.getAttribute("aria-label"))[2]).toBe("Show photo 3");
  });

  it("warms up the first slide and its neighbour after hydration, then follows the current photo", () => {
    mount(<Gallery {...props} />);
    const loading = () => [...container.querySelectorAll<HTMLImageElement>(".gallery__img")].map((i) => i.loading);
    expect(loading()).toEqual(["eager", "eager", "lazy", "lazy", "lazy"]);
    act(() => section().goToPhoto(3));
    expect(loading()).toEqual(["eager", "eager", "eager", "eager", "eager"]);
  });

  it("has no controls for a single photo and renders nothing for none", () => {
    mount(<Gallery {...props} slides={props.slides.slice(0, 1)} />);
    expect(counter()).toBe("1 / 1");
    expect(container.querySelector(".gallery__nav")).toBeNull();
    expect(container.querySelector(".gallery__thumbs")).toBeNull();
    act(() => root.render(<Gallery {...props} slides={[]} />));
    expect(container.innerHTML).toBe("");
  });
});

describe("programmatic API and events", () => {
  it("changes the current slide, clamps the index and dispatches gallery-change", () => {
    mount(<Gallery {...props} />);
    const events: GalleryChangeDetail[] = [];
    section().addEventListener("gallery-change", (e) => events.push((e as CustomEvent).detail));

    act(() => section().goToPhoto(2));
    expect(counter()).toBe("3 / 5");
    expect(container.querySelectorAll(".gallery__thumb")[2].getAttribute("aria-current")).toBe("true");
    act(() => section().next());
    expect(counter()).toBe("4 / 5");
    act(() => section().previous());
    act(() => section().previous());
    expect(counter()).toBe("2 / 5");
    act(() => section().goToPhoto(99));
    expect(counter()).toBe("5 / 5");
    act(() => section().goToPhoto(-4));
    expect(counter()).toBe("1 / 5");
    expect(events).toEqual([
      { index: 2, count: 5 },
      { index: 3, count: 5 },
      { index: 2, count: 5 },
      { index: 1, count: 5 },
      { index: 4, count: 5 },
      { index: 0, count: 5 },
    ]);
  });

  it("follows the buttons, thumbnails and keyboard arrows", () => {
    mount(<Gallery {...props} />);
    act(() => void (container.querySelector(".gallery__nav--next") as HTMLElement).click());
    expect(counter()).toBe("2 / 5");
    act(() => void (container.querySelectorAll(".gallery__thumb")[3] as HTMLElement).click());
    expect(counter()).toBe("4 / 5");
    const viewport = container.querySelector(".gallery__viewport") as HTMLElement;
    key(viewport, "ArrowLeft");
    expect(counter()).toBe("3 / 5");
    key(viewport, "End");
    expect(counter()).toBe("5 / 5");
    key(viewport, "Home");
    expect(counter()).toBe("1 / 5");
    key(viewport, "ArrowRight");
    expect(counter()).toBe("2 / 5");
  });

  it("supports #gallery-N deep links on load and on hashchange", () => {
    window.location.hash = "#gallery-3";
    mount(<Gallery {...props} />);
    expect(counter()).toBe("3 / 5");
    window.location.hash = "#gallery-5";
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(counter()).toBe("5 / 5");
    window.location.hash = "#gallery";
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(counter()).toBe("5 / 5"); // plain #gallery only scrolls to the block
  });
});

describe("live region", () => {
  it("announces only after a user action", () => {
    mount(<Gallery {...props} />);
    expect(live()).toBe("");
    act(() => section().goToPhoto(2));
    expect(live()).toBe("3 of 5");
    act(() => void (container.querySelector(".gallery__nav--next") as HTMLElement).click());
    expect(live()).toBe("4 of 5");
  });

  it("stays silent while autoplay advances the slides", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} autoplaySeconds={3} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(counter()).toBe("2 / 5");
    act(() => void vi.advanceTimersByTime(3000));
    expect(counter()).toBe("3 / 5");
    expect(live()).toBe("");
  });
});

describe("autoplay", () => {
  it("is off by default", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} />);
    expect(section().dataset.autoplay).toBe("off");
    act(() => void vi.advanceTimersByTime(60_000));
    expect(counter()).toBe("1 / 5");
  });

  it("advances every N seconds and wraps around", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} slides={props.slides.slice(0, 2)} autoplaySeconds={2} />);
    expect(section().dataset.autoplay).toBe("on");
    act(() => void vi.advanceTimersByTime(2000));
    expect(counter()).toBe("2 / 2");
    act(() => void vi.advanceTimersByTime(2000));
    expect(counter()).toBe("1 / 2");
  });

  it("pauses on hover, on focus and when the tab is hidden", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} autoplaySeconds={2} />);
    const move = (type: string, related: EventTarget | null) =>
      act(() => void section().dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related as Node | null })));

    move("mouseover", document.body);
    expect(section().dataset.autoplay).toBe("paused");
    act(() => void vi.advanceTimersByTime(10_000));
    expect(counter()).toBe("1 / 5");
    move("mouseout", document.body);
    expect(section().dataset.autoplay).toBe("on");

    const thumb = container.querySelectorAll(".gallery__thumb")[0] as HTMLElement;
    act(() => void thumb.focus());
    expect(section().dataset.autoplay).toBe("paused");
    act(() => void thumb.blur());
    expect(section().dataset.autoplay).toBe("on");

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(section().dataset.autoplay).toBe("paused");
    act(() => void vi.advanceTimersByTime(10_000));
    expect(counter()).toBe("1 / 5");
  });

  it("is disabled entirely under prefers-reduced-motion", () => {
    vi.useFakeTimers();
    reducedMotion(true);
    mount(<Gallery {...props} autoplaySeconds={2} />);
    expect(section().dataset.autoplay).toBe("off");
    act(() => void vi.advanceTimersByTime(20_000));
    expect(counter()).toBe("1 / 5");
  });
});

describe("thumbnail strip", () => {
  const strip = () => container.querySelector(".gallery__thumbs") as HTMLUListElement;
  const wrap = () => container.querySelector(".gallery__thumbs-wrap") as HTMLElement;
  const measure = (scrollLeft: number) => {
    Object.defineProperty(strip(), "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(strip(), "scrollWidth", { configurable: true, value: 1000 });
    Object.defineProperty(strip(), "scrollLeft", { configurable: true, writable: true, value: scrollLeft });
    act(() => void strip().dispatchEvent(new Event("scroll")));
  };

  it("shows an edge fade only on the sides that have more thumbnails", () => {
    mount(<Gallery {...props} />);
    measure(0);
    expect(wrap().className).toContain("gallery__thumbs-wrap--more-end");
    expect(wrap().className).not.toContain("more-start");
    measure(200);
    expect(wrap().className).toContain("more-start");
    expect(wrap().className).toContain("more-end");
    measure(700);
    expect(wrap().className).toContain("more-start");
    expect(wrap().className).not.toContain("more-end");
  });

  it("scrolls the strip, not the page, to keep the active thumbnail centred", () => {
    mount(<Gallery {...props} />);
    const scrollTo = vi.fn();
    strip().scrollTo = scrollTo as any;
    Object.defineProperty(strip(), "clientWidth", { configurable: true, value: 300 });
    [...strip().children].forEach((li, i) => {
      Object.defineProperty(li, "offsetLeft", { configurable: true, value: i * 100 });
      Object.defineProperty(li, "offsetWidth", { configurable: true, value: 90 });
    });
    act(() => section().goToPhoto(3));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 3 * 100 - (300 - 90) / 2, behavior: "smooth" });
    act(() => section().goToPhoto(0));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" }); // never negative
  });

  it("does not animate the strip under prefers-reduced-motion", () => {
    reducedMotion(true);
    mount(<Gallery {...props} />);
    const scrollTo = vi.fn();
    strip().scrollTo = scrollTo as any;
    act(() => section().goToPhoto(2));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});

describe("lightbox", () => {
  const dialog = () => container.querySelector("dialog.lightbox") as HTMLDialogElement | null;
  const lbCounter = () => dialog()?.querySelector(".lightbox__counter")?.textContent;

  function openFromSlide(n: number) {
    const opener = container.querySelectorAll(".gallery__open")[n] as HTMLElement;
    opener.focus();
    act(() => void opener.click());
    return opener;
  }

  it("opens full screen on click, with the larger image, and focuses the close button", () => {
    mount(<Gallery {...props} />);
    expect(dialog()).toBeNull();
    openFromSlide(1);
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.getAttribute("aria-label")).toBe("Photo viewer");
    expect(lbCounter()).toBe("2 / 5");
    expect(dialog()?.querySelector("img")?.getAttribute("sizes")).toBe("100vw");
    expect(document.activeElement).toBe(dialog()?.querySelector(".lightbox__close"));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("moves with the arrow keys and keeps the gallery in sync", () => {
    mount(<Gallery {...props} />);
    openFromSlide(1);
    key(dialog()!, "ArrowRight");
    expect(lbCounter()).toBe("3 / 5");
    expect(counter()).toBe("3 / 5");
    key(dialog()!, "ArrowLeft");
    key(dialog()!, "ArrowLeft");
    key(dialog()!, "ArrowLeft"); // already first: stays
    expect(lbCounter()).toBe("1 / 5");
  });

  it("traps Tab inside the dialog", () => {
    mount(<Gallery {...props} />);
    openFromSlide(1);
    const close = dialog()!.querySelector(".lightbox__close") as HTMLElement;
    const next = dialog()!.querySelector(".gallery__nav--next") as HTMLElement;
    next.focus();
    key(dialog()!, "Tab");
    expect(document.activeElement).toBe(close); // last -> first
    key(dialog()!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(next); // first -> last
  });

  it("closes with Escape or the close button and returns focus to what opened it", () => {
    mount(<Gallery {...props} />);
    let opener = openFromSlide(2);
    key(dialog()!, "Escape");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");

    opener = openFromSlide(0);
    act(() => void (dialog()!.querySelector(".lightbox__close") as HTMLElement).click());
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("after moving on in the viewer, focus goes to the current photo and the gallery stays there", () => {
    mount(<Gallery {...props} />);
    openFromSlide(1);
    key(dialog()!, "ArrowRight");
    key(dialog()!, "ArrowRight");
    key(dialog()!, "Escape");
    expect(dialog()).toBeNull();
    expect(counter()).toBe("4 / 5");
    expect(document.activeElement).toBe(container.querySelectorAll(".gallery__open")[3]);
  });

  it("can be opened and closed through the API", () => {
    mount(<Gallery {...props} />);
    act(() => section().openLightbox(3));
    expect(lbCounter()).toBe("4 / 5");
    expect(counter()).toBe("4 / 5");
    act(() => section().closeLightbox());
    expect(dialog()).toBeNull();
    act(() => section().openLightbox());
    expect(lbCounter()).toBe("4 / 5"); // no index: the current photo
  });

  it("pauses autoplay while open", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} autoplaySeconds={2} />);
    act(() => section().openLightbox(0));
    expect(section().dataset.autoplay).toBe("paused");
    act(() => void vi.advanceTimersByTime(10_000));
    expect(lbCounter()).toBe("1 / 5");
  });
});
