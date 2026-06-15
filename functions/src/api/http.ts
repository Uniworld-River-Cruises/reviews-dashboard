import { createHash, randomUUID } from "crypto";

/** Error carrying an HTTP status + machine-readable code for the uniform
 * `{ error: { code, message, request_id } }` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: Record<string, string>
  ) {
    super(message);
  }
}

export function newRequestId(): string {
  return randomUUID();
}

/**
 * Send a JSON response with the standard headers. Successful GET responses
 * get `Cache-Control: private` + a weak ETag (honouring If-None-Match with
 * 304) so a consuming backend's HTTP cache can avoid re-downloading; auth
 * and error responses are `no-store`.
 */
export function sendJson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  requestId: string,
  status: number,
  body: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: { cacheSeconds?: number; noStore?: boolean; req?: any } = {}
): void {
  const payload = JSON.stringify(body);
  res.set("X-Request-Id", requestId);
  res.set("Content-Type", "application/json; charset=utf-8");

  if (opts.noStore) {
    res.set("Cache-Control", "no-store");
  } else {
    res.set("Cache-Control", `private, max-age=${opts.cacheSeconds ?? 300}`);
    const etag = `W/"${createHash("sha1").update(payload).digest("hex")}"`;
    res.set("ETag", etag);
    const ifNoneMatch = opts.req?.headers?.["if-none-match"];
    if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }
  }

  res.status(status).send(payload);
}

/**
 * Send a public, cacheable document (the OpenAPI spec or the docs page).
 * Unlike sendJson these are non-sensitive and identical for every caller, so
 * they get `Cache-Control: public` and a weak ETag with 304 support.
 */
export function sendDoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
  requestId: string,
  body: string,
  contentType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: { cacheSeconds?: number; req?: any } = {}
): void {
  res.set("X-Request-Id", requestId);
  res.set("Content-Type", contentType);
  res.set("Cache-Control", `public, max-age=${opts.cacheSeconds ?? 3600}`);
  const etag = `W/"${createHash("sha1").update(body).digest("hex")}"`;
  res.set("ETag", etag);
  const ifNoneMatch = opts.req?.headers?.["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }
  res.status(200).send(body);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sendError(res: any, requestId: string, error: unknown): void {
  if (error instanceof ApiError) {
    if (error.headers) {
      for (const [key, value] of Object.entries(error.headers)) {
        res.set(key, value);
      }
    }
    sendJson(
      res,
      requestId,
      error.status,
      { error: { code: error.code, message: error.message, request_id: requestId } },
      { noStore: true }
    );
    return;
  }

  console.error("reviewsApi unhandled error:", error);
  sendJson(
    res,
    requestId,
    500,
    {
      error: {
        code: "internal",
        message: "Internal server error.",
        request_id: requestId,
      },
    },
    { noStore: true }
  );
}
