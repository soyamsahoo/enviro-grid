/**
 * Vercel serverless proxy for the Gemini Interactions API.
 * File mirrors the URL: /api/gemini/v1beta/interactions.
 * Google's endpoint rejects browser CORS preflights, so all LLM traffic
 * goes through this same-origin function.
 *
 * Env: LLM_API_KEY (or VITE_LLM_API_KEY). Falls back to the key the
 * browser sends in x-goog-api-key.
 */
const UPSTREAM = "https://generativelanguage.googleapis.com";

export default async function handler(req: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}, res: {
  status: (code: number) => { json: (body: unknown) => void };
}) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const clientKey = req.headers["x-goog-api-key"];
  const key =
    process.env.LLM_API_KEY ||
    process.env.VITE_LLM_API_KEY ||
    (typeof clientKey === "string" ? clientKey : "");

  if (!key) {
    res.status(500).json({ error: "LLM_API_KEY not configured on the server" });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/v1beta/interactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const text = await upstream.text();
    res.status(upstream.status).json(safeJson(text));
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
