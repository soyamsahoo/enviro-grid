/**
 * Vercel serverless proxy for the OpenAQ v3 API.
 * Injects the server-side API key so it never ships in the client bundle.
 *
 * Env: OPENAQ_API_KEY (or VITE_OPENAQ_API_KEY) — set in the Vercel dashboard.
 */
const UPSTREAM = "https://api.openaq.org";

export default async function handler(req: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}, res: {
  status: (code: number) => { json: (body: unknown) => void };
}) {
  const path = (req.url ?? "").replace(/^\/api\/openaq/, "");
  const key =
    process.env.OPENAQ_API_KEY ||
    process.env.VITE_OPENAQ_API_KEY ||
    (typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : "");

  if (!key) {
    res.status(500).json({ error: "OPENAQ_API_KEY not configured on the server" });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}${path}`, {
      method: req.method,
      headers: {
        "X-API-Key": key,
        Accept: "application/json",
      },
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
