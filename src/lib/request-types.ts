// Self-contained like languages.ts (the lead context imports it with plain Node): the kinds of request a visitor can
// send, as plain data. Which of them a product offers is `requestTypes` in the product type's fields.ts.
import type { Language } from "./languages.ts";

export const REQUEST_TYPES = {
  viewing: { label: { en: "Viewing", de: "Besichtigung", tr: "Yerinde inceleme", bg: "Оглед" }, slots: true },
  testdrive: { label: { en: "Test drive", de: "Probefahrt", tr: "Test sürüşü", bg: "Тест драйв" }, slots: true },
  question: { label: { en: "Question", de: "Frage", tr: "Soru", bg: "Въпрос" }, slots: false },
  offer: { label: { en: "Make an offer", de: "Angebot machen", tr: "Teklif verin", bg: "Направете оферта" }, slots: false },
} as const satisfies Record<string, { label: Record<Language, string>; slots: boolean }>;

export type RequestType = keyof typeof REQUEST_TYPES;
export const REQUEST_TYPE_IDS = Object.keys(REQUEST_TYPES) as [RequestType, ...RequestType[]];

/** The type that is selected when the form opens. */
export const DEFAULT_REQUEST_TYPE: RequestType = "question";

export const isRequestType = (value: unknown): value is RequestType => typeof value === "string" && Object.hasOwn(REQUEST_TYPES, value);

/**
 * The canonical id of a request type. "testdrive" is canonical (in the record, the API and the page_context answer); "test_drive" is accepted as the same thing
 * (the first name of the type: a button's data-request-type, an older client). null for anything else.
 */
export function canonicalRequestType(value: unknown): RequestType | null {
  const v = value === "test_drive" ? "testdrive" : value;
  return isRequestType(v) ? v : null;
}

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

/**
 * The request type the voice assistant's navigation to #contact-<type> opens: that type when the product offers it; a type it does not offer (a test drive for a house),
 * or any other, falls back to the default type; and the plain "contact" (/#contact) is a viewing, or the first type the product offers when it has no viewing.
 */
export function navigationType(raw: unknown, allowed: readonly RequestType[]): RequestType {
  if (raw === "contact") return allowed.includes("viewing") ? "viewing" : (allowed[0] ?? DEFAULT_REQUEST_TYPE);
  const type = canonicalRequestType(raw);
  if (type !== null && allowed.includes(type)) return type;
  return allowed.includes(DEFAULT_REQUEST_TYPE) ? DEFAULT_REQUEST_TYPE : (allowed[0] ?? DEFAULT_REQUEST_TYPE);
}

/** The preset of a button, or the default type when the product does not offer it (its product type's requestTypes). */
export function resolvePreset(preset: unknown, allowed: readonly RequestType[]): RequestType {
  const type = canonicalRequestType(preset);
  return type !== null && allowed.includes(type) ? type : DEFAULT_REQUEST_TYPE;
}
