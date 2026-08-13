/**
 * Vercel serverless proxy for OpenAQ v3 /locations/{id}/latest.
 * File mirrors the URL: /api/openaq/v3/locations/{id}/latest.
 */
const UPSTREAM = "https://api.openaq.org";

export default async function handler(req: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}, res: {
  status: (code: number) => { json: (body: unknown) => void };
}) {
  const clientKey = req.headers["x-api-key"];
  const key =
    process.env.OPENAQ_API_KEY ||
    process.env.VITE_OPENAQ_API_KEY ||
    (typeof clientKey === "string" ? clientKey : "");

  if (!key) {
    res.status(500).json({ error: "OPENAQ_API_KEY not configured on the server" });
    return;
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: "invalid station id" });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/v3/locations/${id}/latest`, {
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