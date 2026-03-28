import { POSITIVE_THEMES, NEGATIVE_THEMES, VALID_POSITIVE_NAMES, VALID_NEGATIVE_NAMES } from "./definitions";

// Lazy-load Anthropic SDK to avoid slowing down Firebase function initialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _anthropic: any = null;
async function getAnthropicClient() {
  if (!_anthropic) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function classifyReview(reviewText: string, retries = 3): Promise<ClassificationResult> {
  if (!reviewText || reviewText.trim().length < 10) {
    return { positive: [], negative: [] };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const client = await getAnthropicClient();
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: reviewText }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      try {
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
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
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && err.message.includes("rate_limit");
      if (isRateLimit && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  return { positive: [], negative: [] }; // fallback
}

/**
 * Classify reviews in batches with per-review error isolation.
 * Concurrency of 8 with 1.5s delay stays around 50 RPM.
 * Retries with backoff handle any rate limit bursts.
 */
export async function classifyBatch(
  reviews: { id: string; text: string }[]
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();
  const CONCURRENCY = 8;

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

    // Throttle to stay around 50 RPM; retries handle bursts
    if (i + CONCURRENCY < reviews.length) {
      await sleep(1500);
    }
  }

  return results;
}
