// Theme classifier model settings, shared by the real-time classifier and the
// Batch API path. No SDK import here, so this is safe to re-export from the
// package index.
//
// There is no "latest Haiku" alias: each Haiku generation has its own ID and
// can change request/response behavior, so upgrades are a one-line PR here
// plus a check of Anthropic's migration notes.

export const DEFAULT_CLASSIFIER_MODEL = "claude-haiku-5-5";

/** Optional override (e.g. CLASSIFIER_MODEL=claude-haiku-4-5 for a side-by-side run). */
export function getClassifierModel(): string {
  return process.env.CLASSIFIER_MODEL?.trim() || DEFAULT_CLASSIFIER_MODEL;
}

/**
 * Request params common to every classification call. Haiku 5.5 thinks by
 * default and thinking counts toward max_tokens, so the cap leaves room for it
 * and effort stays low (classification gains little from deeper thinking).
 * Haiku 4.5 rejects `effort`, so it is only sent to newer models.
 */
export function classifierRequestParams(model = getClassifierModel()): {
  model: string;
  max_tokens: number;
  output_config?: { effort: "low" };
} {
  const params = { model, max_tokens: 2048 };
  return model.startsWith("claude-haiku-4-5") ? params : { ...params, output_config: { effort: "low" } };
}

/**
 * Joins the text blocks of a Messages API response. Responses can open with
 * `thinking` blocks, so never read `content[0]` as the answer.
 */
export function extractResponseText(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}
