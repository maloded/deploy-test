// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- DOM test helpers */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Gallery, type GalleryElement } from "@/components/Gallery";
import { galleryProps, type GallerySlide } from "@/components/gallery-props";
import { QUIET_MS } from "@/lib/gallery-store";
import { siteFor } from "./helpers";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const base = galleryProps(siteFor("fixture-car"));
// the fixture has no spots: give the third photo (cabin) two, one with facts from specs and one with a text
const slides: GallerySlide[] = base.slides.map((s) =>
  s.id === "cabin"
    ? { ...s, spots: [{ id: "seats", x: 0.3, y: 0.5, label: "Seats", facts: [{ label: "Seats", value: "7 (2-2-3)" }], text: null }, { id: "roof", x: 0.5, y: 0.1, label: "Roof", facts: [], text: "Panoramic glass roof" }] }
    : s,
);
const props = { ...base, slides };

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
const activeCat = () => container.querySelector(".gallery__cat[data-active='true']")?.textContent;
const reducedMotion = (matches: boolean) =>
  (window.matchMedia = (() => ({ matches, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any);
const key = (target: Element, k: string) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));

beforeEach(() => {
  window.location.hash = "";
  reducedMotion(false);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the passive category indicator", () => {
  it("lists the categories of the sequence in order, as plain text, aria-hidden, not focusable, not a button", () => {
    mount(<Gallery {...props} />);
    const cats = container.querySelector(".gallery__cats") as HTMLElement;
    expect(cats.getAttribute("aria-hidden")).toBe("true");
    expect([...cats.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Exterior", "Interior", "Details"]);
    expect(cats.querySelectorAll("button, a, [tabindex], [role]")).toHaveLength(0);
    expect(cats.closest("button, a")).toBeNull();
  });

  it("highlights the category of the current photo and follows every change", () => {
    mount(<Gallery {...props} />);
    expect(activeCat()).toBe("Exterior");
    act(() => section().goToPhoto(2));
    expect(activeCat()).toBe("Interior");
    expect(section().getAttribute("data-category")).toBe("interior");
    act(() => section().goToPhoto(4));
    expect(activeCat()).toBe("Details");
    act(() => section().goToPhoto(1));
    expect(activeCat()).toBe("Exterior");
    expect(container.querySelectorAll(".gallery__cat[data-active='true']")).toHaveLength(1);
  });

  it("uses the labels of the content when given", () => {
    mount(<Gallery {...props} categoryLabels={{ exterior: "Außen", interior: "Innen", details: "Einzelheiten" }} />);
    expect([...container.querySelectorAll(".gallery__cat")].map((li) => li.textContent)).toEqual(["Außen", "Innen", "Einzelheiten"]);
  });

  it("is left out when there is only one category", () => {
    mount(<Gallery {...props} slides={slides.filter((s) => s.category === "exterior")} />);
    expect(container.querySelector(".gallery__cats")).toBeNull();
  });
});

describe("caption, dots, announcement", () => {
  it("has no caption under the photo (captions stay in the content, the slide labels and the announcement)", () => {
    mount(<Gallery {...props} slides={slides.map((s, i) => (i === 1 ? { ...s, caption: "Rear view" } : s))} />);
    expect(container.querySelector(".gallery__caption")).toBeNull();
    expect(container.textContent).not.toContain("Rear view");
    expect(container.querySelectorAll(".gallery__slide")[1].getAttribute("aria-label")).toBe("Exterior, photo 2 of 5: Rear view");
    act(() => section().goToPhoto(1));
    expect(live()).toBe("Exterior, photo 2 of 5: Rear view");
  });

  it("has no full-screen button, no viewer and no clickable photo", () => {
    mount(<Gallery {...props} />);
    expect(container.querySelector(".gallery__fullscreen, .gallery__open, dialog")).toBeNull();
    expect((section() as any).openLightbox).toBeUndefined();
    expect((section() as any).closeLightbox).toBeUndefined();
  });

  it("shows the counter as a small aria-hidden pill over the photo (inside the viewport), the dots and the indicator under it", () => {
    mount(<Gallery {...props} />);
    const counterEl = container.querySelector(".gallery__counter") as HTMLElement;
    expect(counterEl.closest(".gallery__viewport")).not.toBeNull();
    expect(counterEl.getAttribute("aria-hidden")).toBe("true");
    const info = container.querySelector(".gallery__info")!;
    expect([...info.children].map((c) => c.className)).toEqual(["gallery__dots", "gallery__cats"]);
  });

  it("has a visible section heading before the photos", () => {
    mount(<Gallery {...props} />);
    const h2 = container.querySelector("h2.section-title") as HTMLElement;
    expect(h2.textContent).toBe("Gallery");
    expect(h2.compareDocumentPosition(container.querySelector(".gallery__viewport")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("has one aria-hidden dot per photo, the current one marked", () => {
    mount(<Gallery {...props} />);
    const dots = container.querySelector(".gallery__dots") as HTMLElement;
    expect(dots.getAttribute("aria-hidden")).toBe("true");
    expect(dots.children).toHaveLength(5);
    act(() => section().goToPhoto(3));
    expect([...dots.children].map((d) => d.getAttribute("data-active"))).toEqual([null, null, null, "true", null]);
  });

  it("announces the category with the photo: 'Interior, photo 3 of 5: ...'", () => {
    mount(<Gallery {...props} />);
    act(() => section().goToPhoto(2));
    expect(live()).toBe("Interior, photo 3 of 5: Fixture photo three");
  });

  it("groups the thumbnails by category", () => {
    mount(<Gallery {...props} />);
    const starts = [...container.querySelectorAll(".gallery__thumbs > li")].map((li) => li.getAttribute("data-group-start"));
    expect(starts).toEqual(["true", null, "true", null, "true"]);
  });
});

describe("hotspots", () => {
  const marker = (id: string) => container.querySelector(`[data-spot='${id}']`) as HTMLButtonElement;
  const card = () => container.querySelector(".gallery__spot-card") as HTMLElement | null;

  it("renders a labelled 'show' button per spot, on its own photo, and no card at first", () => {
    mount(<Gallery {...props} />);
    expect(marker("seats").getAttribute("aria-label")).toBe("Show: Seats");
    expect(marker("seats").closest(".gallery__slide")?.getAttribute("data-id")).toBe("cabin");
    expect(card()).toBeNull();
  });

  it("a tap opens the card with facts and text, moves focus into it, and the close button returns focus to the marker", () => {
    mount(<Gallery {...props} />);
    act(() => section().goToPhoto(2));
    act(() => void marker("seats").click());
    expect(card()?.textContent).toContain("7 (2-2-3)");
    expect(marker("seats").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(card()?.querySelector(".gallery__spot-close"));
    act(() => void (card()?.querySelector(".gallery__spot-close") as HTMLElement).click());
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(marker("seats"));
  });

  it("a text-only spot shows its text; another spot replaces the open one; Escape closes it", () => {
    mount(<Gallery {...props} />);
    act(() => section().goToPhoto(2));
    act(() => void marker("seats").click());
    act(() => void marker("roof").click());
    expect(card()?.getAttribute("data-spot-card")).toBe("roof");
    expect(card()?.textContent).toContain("Panoramic glass roof");
    key(container.querySelector(".gallery__viewport")!, "Escape");
    expect(card()).toBeNull();
  });

  it("moving to another photo closes the spot", () => {
    mount(<Gallery {...props} />);
    act(() => section().goToPhoto(2));
    act(() => void marker("roof").click());
    act(() => void (container.querySelector(".gallery__nav--next") as HTMLElement).click());
    expect(card()).toBeNull();
  });

  it("markers of photos that are not on screen are out of the tab order", () => {
    mount(<Gallery {...props} />);
    expect(marker("seats").tabIndex).toBe(-1);
    act(() => section().goToPhoto(2));
    expect(marker("seats").tabIndex).toBe(0);
  });
});

describe("addresses and the agent: showAddress", () => {
  const view = () => section().getView();
  const show = (hash: string) => {
    let out = "";
    act(() => void (out = section().showAddress(hash)));
    return out;
  };

  it("#gallery-<category> shows the first photo of the category and writes the address", () => {
    mount(<Gallery {...props} />);
    expect(show("#gallery-interior")).toBe("handled");
    expect(view()).toMatchObject({ category: "interior", photo: "cabin", index: 3, total: 5 });
    expect(window.location.hash).toBe("#gallery-interior");
    expect(show("#gallery-details")).toBe("handled");
    expect(view().photo).toBe("detail");
  });

  it("#photo-<id> and the older #gallery-N", () => {
    mount(<Gallery {...props} />);
    expect(show("#photo-boot")).toBe("handled");
    expect(view()).toMatchObject({ photo: "boot", index: 4 });
    expect(window.location.hash).toBe("#photo-boot");
    expect(show("#gallery-2")).toBe("handled");
    expect(view().photo).toBe("rear");
    expect(window.location.hash).toBe("#photo-rear"); // the canonical address of the photo
  });

  it("#spot-<id> shows the photo with the spot open", () => {
    mount(<Gallery {...props} />);
    expect(show("#spot-roof")).toBe("handled");
    expect(view()).toMatchObject({ photo: "cabin", spot: "roof" });
    expect(container.querySelector(".gallery__spot-card")?.getAttribute("data-spot-card")).toBe("roof");
    expect(window.location.hash).toBe("#spot-roof");
    expect(live()).toContain("Panoramic glass roof");
  });

  it("#gallery scrolls the section into view and leaves the view alone", () => {
    mount(<Gallery {...props} />);
    act(() => section().goToPhoto(3));
    const scroll = vi.fn();
    section().scrollIntoView = scroll;
    expect(show("#gallery")).toBe("handled");
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(view().photo).toBe("boot");
  });

  it("unknown names are unhandled, never silently mapped, and change nothing", () => {
    mount(<Gallery {...props} />);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    act(() => section().goToPhoto(1));
    for (const h of ["#photo-nope", "#spot-nope", "#gallery-garden", "#gallery-9", "#gallery-0", "#contact", "#"]) {
      expect(show(h), h).toBe("unhandled");
    }
    expect(view().photo).toBe("rear");
    expect(window.location.hash).toBe("");
  });

  it("reduced motion: the section is scrolled into view instantly", () => {
    reducedMotion(true);
    mount(<Gallery {...props} />);
    const scroll = vi.fn();
    section().scrollIntoView = scroll;
    act(() => void section().showAddress("#photo-boot"));
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("the visitor's own hash (a link, or the address on load) applies at once and writes nothing", () => {
    window.location.hash = "#photo-boot";
    mount(<Gallery {...props} />);
    expect(counter()).toBe("4 / 5");
    window.location.hash = "#spot-seats";
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(view()).toMatchObject({ photo: "cabin", spot: "seats" });
    window.location.hash = "#photo-nope";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(view().photo).toBe("cabin");
  });
});

describe("the agent does not fight the visitor", () => {
  it("an agent request within 2 s of a tap is queued (reported as queued), then shown, latest wins", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} />);
    act(() => void (container.querySelector(".gallery__nav--next") as HTMLElement).click()); // the visitor
    expect(counter()).toBe("2 / 5");
    let first = "";
    let second = "";
    act(() => void (first = section().showAddress("#photo-detail")));
    act(() => void (second = section().showAddress("#photo-boot")));
    expect([first, second]).toEqual(["queued", "queued"]);
    expect(counter()).toBe("2 / 5");
    act(() => void vi.advanceTimersByTime(QUIET_MS + 50));
    expect(counter()).toBe("4 / 5");
    expect(live()).toBe("Interior, photo 4 of 5: Fixture photo four");
  });

  it("without a recent visitor action it is shown at once", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} />);
    act(() => void section().showAddress("#photo-boot"));
    expect(counter()).toBe("4 / 5");
  });
});

describe("getView", () => {
  it("is the category, photo id, 1-based index, total and spot", () => {
    mount(<Gallery {...props} />);
    expect(section().getView()).toEqual({ category: "exterior", photo: "front", index: 1, total: 5, spot: null });
    act(() => void section().showAddress("#spot-seats"));
    expect(section().getView()).toEqual({ category: "interior", photo: "cabin", index: 3, total: 5, spot: "seats" });
  });
});

describe("the agent's own slide is not the visitor's activity", () => {
  const track = () => container.querySelector(".gallery__track") as HTMLElement;
  const scrollTo = (left: number) => {
    Object.defineProperty(track(), "clientWidth", { configurable: true, value: 100 });
    track().scrollLeft = left;
    act(() => void track().dispatchEvent(new Event("scroll")));
  };

  it("scroll events after an agent change (no hands on the track) do not make the next agent request wait", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} />);
    Object.defineProperty(track(), "clientWidth", { configurable: true, value: 100 });
    expect(section().showAddress("#photo-boot")).toBe("handled");
    scrollTo(300); // the track passes photo 4 and settles: scroll events with nobody touching it
    scrollTo(300);
    let second = "";
    act(() => void (second = section().showAddress("#photo-rear")));
    expect(second).toBe("handled");
    act(() => void vi.advanceTimersByTime(10));
    expect(counter()).toBe("2 / 5");
  });

  it("a swipe by the visitor (hands on the track, then scroll events) does count: the next agent request is queued", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} />);
    Object.defineProperty(track(), "clientWidth", { configurable: true, value: 100 });
    act(() => void container.querySelector(".gallery__viewport")!.dispatchEvent(new Event("touchstart", { bubbles: true })));
    scrollTo(200);
    expect(counter()).toBe("3 / 5");
    let result = "";
    act(() => void (result = section().showAddress("#photo-detail")));
    expect(result).toBe("queued");
    expect(counter()).toBe("3 / 5");
  });
});

describe("a resize is not a swipe", () => {
  it("re-aligns the track at once and ignores the scroll events of doing so: the photo stays", () => {
    vi.useFakeTimers();
    mount(<Gallery {...props} />);
    const track = container.querySelector(".gallery__track") as HTMLElement;
    Object.defineProperty(track, "clientWidth", { configurable: true, value: 100 });
    const scrollTo = vi.fn();
    track.scrollTo = scrollTo as any;
    act(() => section().goToPhoto(3));
    scrollTo.mockClear();
    act(() => void window.dispatchEvent(new Event("resize")));
    expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: "instant" });
    track.scrollLeft = 0; // what the browser does to the position while the layout changes
    act(() => void track.dispatchEvent(new Event("scroll")));
    expect(counter()).toBe("4 / 5");
  });
});
