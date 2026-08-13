/**
 * Vercel serverless proxy for the NASA FIRMS area API (CSV).
 * File mirrors the URL: /api/firms/api/area/csv/{key}/{source}/{bbox}/{day}.
 * The FIRMS map key travels in the URL path (FIRMS's own auth scheme).
 */
const UPSTREAM = "https://firms.modaps.eosdis.nasa.gov";

export default async function handler(req: {
  method: string;
  query: Record<string, string | string[] | undefined>;
}, res: {
  status: (code: number) => {
    json: (body: unknown) => void;
    setHeader: (name: string, value: string) => void;
    send: (body: string) => void;
  };
}) {
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

  const key = str(req.query.key);
  const source = str(req.query.source);
  const bbox = str(req.query.bbox);
  const day = str(req.query.day);

  const serverKey = process.env.NASA_FIRMS_MAP_KEY || process.env.VITE_NASA_FIRMS_MAP_KEY || "";
  const finalKey = key || serverKey;

  if (!finalKey || !source || !bbox || !/^[1-9]$/.test(day)) {
    res.status(400).json({ error: "missing or invalid FIRMS params (key, source, bbox, day)" });
    return;
  }

  try {
    const upstream = await fetch(
      `${UPSTREAM}/api/area/csv/${finalKey}/${source}/${bbox}/${day}`,
      { method: "GET", headers: { Accept: "text/csv" } },
    );
    const text = await upstream.text();
    if (upstream.status !== 200) {
      res.status(upstream.status).json({ error: `FIRMS upstream ${upstream.status}`, body: text.slice(0, 200) });
      return;
    }
    res.status(200).setHeader("Content-Type", "text/csv");
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: `upstream failure: ${String(err)}` });
  }
}