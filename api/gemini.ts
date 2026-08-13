/**
 * Vercel serverless proxy for the Gemini Interactions API.
 * The Google endpoint rejects browser CORS preflights (403, no ACAO
 * headers), so all LLM traffic runs through this same-origin function.
 *
 * Env: LLM_API_KEY (or VITE_LLM_API_KEY) — set in the Vercel dashboard.
 */
const UPSTREAM = "https://generativelanguage.googleapis.com";

export default async function handler(req: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  body?: unknown;
}, res: {
  status: (code: number) => { json: (body: unknown) => void; send: (body: unknown) => void };
}) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const path = (req.url ?? "").replace(/^\/api\/gemini/, "") || "/v1beta/interactions";

  const key =
    process.env.LLM_API_KEY ||
    process.env.VITE_LLM_API_KEY ||
    (typeof req.headers["x-goog-api-key"] === "string"
      ? req.headers["x-goog-api-key"]
      : "");

  if (!key) {
    res.status(500).json({ error: "LLM_API_KEY not configured on the server" });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
        "Api-Revision":
          (typeof req.headers["api-revision"] === "string"
            ? req.headers["api-revision"]
            : undefined) ?? "2026-05-20",
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const text = await upstream.text();
    res.status(upstream.status).json(text ? safeJson(text) : {});
  } catch (err) {
    res.status(502).json({ error: `upstream failure: ${String(err)}` });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
