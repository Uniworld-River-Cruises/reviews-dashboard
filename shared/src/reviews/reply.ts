import { FeefoReview, FeefoThreadEntry } from "../feefo/types";

/** A merchant reply to a review, as stored on the review document. */
export interface ReviewReply {
  /** Plain text derived from `html`; the only form the public API exposes. */
  text: string;
  /** The comment exactly as Feefo returned it (may contain HTML). */
  html: string;
  author: string | null;
  createdAt: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Convert a Feefo merchant comment (which may be HTML) to plain text:
 * `<br>`, `</p>` and `</div>` become line breaks, every other tag is
 * stripped, entities are decoded, and non-breaking spaces become normal
 * spaces. The result is plain text, not safe HTML: consumers must still
 * escape it when rendering.
 */
export function htmlToPlainText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  );
  return text
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The latest MERCHANT_COMMENT across the review's service and product
 * threads (Feefo attaches the thread to whichever part was replied to), or
 * null when there is none or it is empty after conversion.
 */
export function extractMerchantReply(raw: FeefoReview): ReviewReply | null {
  const entries: FeefoThreadEntry[] = [
    ...(raw.service?.thread ?? []),
    ...(raw.products ?? []).flatMap((p) => p.thread ?? []),
  ].filter((e) => e.type === "MERCHANT_COMMENT" && typeof e.comment === "string");

  let latest: FeefoThreadEntry | null = null;
  for (const entry of entries) {
    if (!latest || (entry.created_at ?? "") >= (latest.created_at ?? "")) latest = entry;
  }
  if (!latest) return null;

  const text = htmlToPlainText(latest.comment as string);
  if (!text) return null;
  return {
    text,
    html: latest.comment as string,
    author: latest.author?.trim() || null,
    createdAt: latest.created_at ?? null,
  };
}
