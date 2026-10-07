import type { Brand } from "../feefo/types";
import { POSITIVE_THEMES, NEGATIVE_THEMES } from "./definitions";

// One line of merchant context so cruise themes aren't applied to land tours.
// Record<Brand, ...> makes a new merchant a compile error here.
const BRAND_LINE: Record<Brand, string> = {
  uniworld: "Uniworld (river cruises)",
  "luxury-gold": "Luxury Gold (escorted land tours by coach and hotel, normally no ship)",
};

const POSITIVE_LIST = POSITIVE_THEMES.map((t) => t.name).join(", ");
const NEGATIVE_LIST = NEGATIVE_THEMES.map((t) => t.name).join(", ");

/**
 * The theme classification prompt, sent as the user message. Wording is the
 * production Haiku 4.5 prompt, kept so tagging stays comparable after the
 * Haiku 5.5 switch; change it only alongside a side-by-side comparison.
 */
export function classifierPrompt(reviewText: string, brand?: Brand | null): string {
  const brandLine = brand && BRAND_LINE[brand] ? `Brand: ${BRAND_LINE[brand]}\n\n` : "";
  return `Classify the following guest review into themes. Return ONLY valid JSON with no markdown formatting, no explanation.

Positive themes: ${POSITIVE_LIST}
Negative themes: ${NEGATIVE_LIST}

${brandLine}Review:
${reviewText}

Return JSON: {"positive": ["Theme1"], "negative": ["Theme2"]}
Return empty arrays if no themes match. Only use themes from the lists above.`;
}
