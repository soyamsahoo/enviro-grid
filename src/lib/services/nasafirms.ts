import type { FireHotspot } from "@/lib/types";
import { fetchText } from "./http";

/**
 * NASA FIRMS active fire data.
 * Docs: https://firms.modaps.eosdis.nasa.gov/api/area/
 * Area queries return CSV — we round-trip through a text proxy to keep
 * everything in one pure fetch pipeline. /api/firms is served by the
 * Vite dev proxy locally and by the Vercel `api/firms` function in prod.
 */
const AREA_CSV_BASE = "/api/firms/api/area/csv";

/** WGS84 source constants used by FIRMS area queries. */
const FIRMS_SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"] as const;

/** Approximate lat/lon degrees spanned by `radiusKm` (equirectangular). */
function boundingBox(lat: number, lon: number, radiusKm: number): string {
  const degLat = radiusKm / 111.32;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const degLon = radiusKm / (111.32 * cosLat);
  const west = lon - degLon;
  const east = lon + degLon;
  const south = lat - degLat;
  const north = lat + degLat;
  return `${west},${south},${east},${north}`;
}

export async function fetchFireHotspots(
  lat: number,
  lon: number,
  radiusKm = 25,
  dayRange = 2,
): Promise<FireHotspot[]> {
  const key = import.meta.env.VITE_NASA_FIRMS_MAP_KEY;
  if (!key) return [];

  const hotspots: FireHotspot[] = [];
  for (const source of FIRMS_SOURCES) {
    try {
      const url =
        `${AREA_CSV_BASE}/${key}/${source}/${boundingBox(lat, lon, radiusKm)}/${dayRange}`;
      const text = await fetchText(url);
      hotspots.push(...parseFirmsCsv(text));
    } catch {
      // A source may be unavailable (NRT gap); skip and keep what we have.
    }
  }
  return hotspots;
}

export function parseFirmsCsv(csv: string): FireHotspot[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iLat = idx("latitude");
  const iLon = idx("longitude");
  const iFrp = idx("frp");
  const iDate = idx("acq_date");
  const iTime = idx("acq_time");
  const iConf = idx("confidence");
  const iSat = idx("satellite");
  if (iLat < 0 || iLon < 0) return [];

  const hotspots: FireHotspot[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const lat = parseFloat(cols[iLat]);
    const lon = parseFloat(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const confidenceRaw = iConf >= 0 ? cols[iConf] : "";
    let confidence: number | null = null;
    if (/^\d+(\.\d+)?$/.test(confidenceRaw)) confidence = parseFloat(confidenceRaw);
    else if (confidenceRaw === "low") confidence = 20;
    else if (confidenceRaw === "nominal") confidence = 50;
    else if (confidenceRaw === "high") confidence = 90;

    hotspots.push({
      lat,
      lon,
      frp: iFrp >= 0 ? parseFloat(cols[iFrp]) || 0 : 0,
      acq_date: iDate >= 0 ? cols[iDate] : "",
      acq_time: iTime >= 0 ? cols[iTime] : "",
      confidence,
      satellite: iSat >= 0 ? cols[iSat] : "",
    });
  }
  return hotspots;
}