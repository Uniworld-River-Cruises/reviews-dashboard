import Anthropic from "@anthropic-ai/sdk";
import { POSITIVE_THEMES, NEGATIVE_THEMES, VALID_POSITIVE_NAMES, VALID_NEGATIVE_NAMES } from "./definitions";

const anthropic = new Anthropic();

export interface ClassificationResult {
  positive: string[];
  negative: string[];
}

const SYSTEM_PROMPT = `You are a review theme classifier for luxury travel brands (Uniworld river cruises and Luxury Gold tours). Given a guest review, identify which themes are present.

POSITIVE THEMES:
${POSITIVE_THEMES.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

NEGATIVE THEMES:
${NEGATIVE_THEMES.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

Rules:
- A review can have multiple positive AND negative themes
- Only include a theme if the review clearly mentions that topic
- A 5-star review can still have negative themes if the guest mentions issues
- A 1-star review can still have positive themes if the guest praises specific aspects
- Return ONLY valid theme names from the lists above

Respond with JSON only, no markdown:
{"positive": ["Theme1", "Theme2"], "negative": ["Theme1"]}`;

export async function classifyReview(reviewText: string): Promise<ClassificationResult> {
  if (!reviewText || reviewText.trim().length < 10) {
    return { positive: [], negative: [] };
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: reviewText }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      positive: Array.isArray(parsed.positive)
        ? parsed.positive.filter((t: string) => (VALID_POSITIVE_NAMES as Set<string>).has(t))
        : [],
      negative: Array.isArray(parsed.negative)
        ? parsed.negative.filter((t: string) => (VALID_NEGATIVE_NAMES as Set<string>).has(t))
        : [],
    };
  } catch {
    console.error("Failed to parse classification response:", text);
    return { positive: [], negative: [] };
  }
}

/**
 * Classify reviews in batches with per-review error isolation.
 * A single review failure does NOT fail the batch.
 */
export async function classifyBatch(
  reviews: { id: string; text: string }[]
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();
  const CONCURRENCY = 10;

  for (let i = 0; i < reviews.length; i += CONCURRENCY) {
    const batch = reviews.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (review) => {
        const result = await classifyReview(review.text);
        return { id: review.id, result };
      })
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.set(outcome.value.id, outcome.value.result);
      } else {
        console.error("Classification failed for a review:", outcome.reason);
      }
    }
  }

  return results;
}
