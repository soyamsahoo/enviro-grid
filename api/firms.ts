/**
 * Vercel serverless proxy for the NASA FIRMS area API (CSV).
 * The FIRMS map key travels in the URL path (FIRMS's own auth scheme);
 * the client sends it, and this function forwards the request as-is.
 * A server-side NASA_FIRMS_MAP_KEY is injected when the path has none.
 */
const UPSTREAM = "https://firms.modaps.eosdis.nasa.gov";

export default async function handler(req: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  url?: string;
}, res: {
  status: (code: number) => {
    json: (body: unknown) => void;
    setHeader: (name: string, value: string) => void;
    send: (body: string) => void;
  };
}) {
  const path = (req.url ?? "").replace(/^\/api\/firms/, "");
  const serverKey =
    process.env.NASA_FIRMS_MAP_KEY || process.env.VITE_NASA_FIRMS_MAP_KEY || "";

  let finalPath = path;
  if (serverKey && /^\/api\/area\/csv\/(?!\S+\/)/.test(path)) {
    finalPath = `/api/area/csv/${serverKey}${path.replace(/^\/api\/area\/csv/, "")}`;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}${finalPath}`, {
      method: req.method,
      headers: { Accept: "text/csv" },
    });
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
