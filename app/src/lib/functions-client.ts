import { auth } from "@/lib/firebase";

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_FUNCTIONS_URL ||
  "https://us-central1-feefo-reviews.cloudfunctions.net";

async function getAuthHeader(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in to run this action.");
  }

  const token = await user.getIdToken();
  return `Bearer ${token}`;
}

export async function postFunction<T>(
  functionName: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const authorization = await getAuthHeader();
  const response = await fetch(`${FUNCTIONS_BASE}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let details = "";
    try {
      const body = (await response.json()) as { error?: string };
      details = body.error ? ` (${body.error})` : "";
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(`Request failed with ${response.status}${details}`);
  }

  return (await response.json()) as T;
}
