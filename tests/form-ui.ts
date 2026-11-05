import { act } from "react";

// Helpers for the form's controls as the dialog has them since the tabs and chips: a request type is a tab, the preferred channel and the contact window are chips,
// a preferred time is a day button and a time button. `root` is the element the page was rendered into.

export function clickEl(el: Element | null | undefined, what = "element"): void {
  if (!el) throw new Error(`no ${what} to click`);
  act(() => void (el as HTMLElement).click());
}

export const tabOf = (root: ParentNode, type: string) => root.querySelector<HTMLButtonElement>(`dialog [role=tab][data-type="${type}"]`);
export const chooseType = (root: ParentNode, type: string) => clickEl(tabOf(root, type), `tab ${type}`);
export const selectedType = (root: ParentNode) => root.querySelector("dialog [role=tab][aria-selected=true]")?.getAttribute("data-type") ?? null;
export const tabTypes = (root: ParentNode) => [...root.querySelectorAll("dialog [role=tab]")].map((t) => t.getAttribute("data-type"));

export const chipOf = (root: ParentNode, channel: string) => root.querySelector<HTMLButtonElement>(`dialog .contact__chip[data-channel="${channel}"]`);
export const chooseChannel = (root: ParentNode, channel: string) => clickEl(chipOf(root, channel), `channel chip ${channel}`);
export const selectedChannel = (root: ParentNode) => root.querySelector("dialog .contact__chip[data-channel][aria-pressed=true]")?.getAttribute("data-channel") ?? null;

export const windowChip = (root: ParentNode, code: string) => root.querySelector<HTMLButtonElement>(`dialog .contact__chip[data-window="${code}"]`);
export const chooseWindow = (root: ParentNode, code: string) => clickEl(windowChip(root, code), `window chip ${code}`);
export const selectedWindow = (root: ParentNode) => root.querySelector("dialog .contact__chip[data-window][aria-pressed=true]")?.getAttribute("data-window") ?? null;
export const windowCodes = (root: ParentNode) => [...root.querySelectorAll("dialog .contact__chip[data-window]")].map((c) => c.getAttribute("data-window"));

export const dayButton = (root: ParentNode, date: string) => root.querySelector<HTMLButtonElement>(`dialog .contact__day[data-day="${date}"]`);
export const timeButton = (root: ParentNode, time: string) => root.querySelector<HTMLButtonElement>(`dialog .contact__time[data-time="${time}"]`);
/** Shows the day and presses the time: a preferred time picked (or taken away again, when it is picked already). */
export function pickSlot(root: ParentNode, date: string, time: string): void {
  clickEl(dayButton(root, date), `day ${date}`);
  clickEl(timeButton(root, time), `time ${time}`);
}
export const pickedSlots = (root: ParentNode) => [...root.querySelectorAll("dialog .contact__pick:not(.is-empty) > span")].map((s) => s.textContent);
