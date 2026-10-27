import { allowedRequestTypes, BUTTON_PRESETS, resolvePreset, type ButtonPlace, type RequestType } from "@/lib/request-types";
import type { Site } from "./blocks";

/** The request types this page's product offers (its product type's list, without viewing types when there are no settings). */
export const offeredTypes = (site: Site): RequestType[] => allowedRequestTypes(site.typeFields.requestTypes, site.viewing !== null);

/** The `data-request-type` of the button in `place`: its preset, or "question" when the product does not offer it. */
export const presetFor = (place: ButtonPlace, site: Site): RequestType => resolvePreset(BUTTON_PRESETS[place], offeredTypes(site));
