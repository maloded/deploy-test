// Self-contained like languages.ts (the lead context imports it with plain Node): the kinds of request a visitor can
// send, as plain data. Which of them a product offers is `requestTypes` in the product type's fields.ts.
import type { Language } from "./languages.ts";

export const REQUEST_TYPES = {
  viewing: { label: { en: "Viewing", de: "Besichtigung" }, slots: true },
  test_drive: { label: { en: "Test drive", de: "Probefahrt" }, slots: true },
  question: { label: { en: "Question", de: "Frage" }, slots: false },
  offer: { label: { en: "Make an offer", de: "Angebot machen" }, slots: false },
} as const satisfies Record<string, { label: Record<Language, string>; slots: boolean }>;

export type RequestType = keyof typeof REQUEST_TYPES;
export const REQUEST_TYPE_IDS = Object.keys(REQUEST_TYPES) as [RequestType, ...RequestType[]];

/** The type that is selected when the form opens. */
export const DEFAULT_REQUEST_TYPE: RequestType = "question";

export const isRequestType = (value: unknown): value is RequestType => typeof value === "string" && Object.hasOwn(REQUEST_TYPES, value);

/** Whether the type asks for preferred time slots (a viewing or a test drive). */
export const needsSlots = (type: RequestType): boolean => REQUEST_TYPES[type].slots;

/**
 * The types a visitor can choose: the product type's list, without those that need slots when the seller and the
 * product have no viewing settings (nothing to book against, so the types are hidden).
 */
export function allowedRequestTypes(listed: readonly RequestType[], hasViewing: boolean): RequestType[] {
  return listed.filter((t) => hasViewing || !needsSlots(t));
}

/**
 * The request type each button that opens the contact dialog presets (data, not decided page by page). The dialog opens
 * with that type selected; the visitor can still change it. The agent interface's open() uses the default type.
 */
export const BUTTON_PRESETS = { header: "question", hero: "question", offer: "offer" } as const satisfies Record<string, RequestType>;
export type ButtonPlace = keyof typeof BUTTON_PRESETS;

/** The preset of a button, or the default type when the product does not offer it (its product type's requestTypes). */
export function resolvePreset(preset: unknown, allowed: readonly RequestType[]): RequestType {
  return isRequestType(preset) && allowed.includes(preset) ? preset : DEFAULT_REQUEST_TYPE;
}
