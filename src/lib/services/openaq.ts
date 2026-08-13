import type { AirQuality } from "@/lib/types";
import { fetchJson } from "./http";

const BASE = "https://api.openaq.org/v3";

interface OpenAQMeasurement {
  value?: number | null;
  parameter?: { name?: string };
  location?: { name?: string };
}

interface OpenAQLatestResponse {
  results?: Array<{ found?: OpenAQMeasurement }>;
}

/** US EPA breakpoints used to derive a common 0–500 AQI across pollutants. */
const EPA_BREAKPOINTS: Record<string, [number, number, number, number][]> = {
  // [conc_low, conc_high, aqi_low, aqi_high]
  pm25: [
    [0.0, 9.0, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 500],
  ],
  pm10: [
    [0, 54, 0, 50],
    [55, 154, 51, 100],
    [155, 254, 101, 150],
    [255, 354, 151, 200],
    [355, 424, 201, 300],
    [425, 604, 301, 500],
  ],
  no2: [
    [0, 53, 0, 50],
    [54, 100, 51, 100],
    [101, 360, 101, 150],
    [361, 649, 151, 200],
    [650, 1249, 201, 300],
    [1250, 2049, 301, 500],
  ],
  o3: [
    [0, 54, 0, 50],
    [55, 70, 51, 100],
    [71, 85, 101, 150],
    [86, 105, 151, 200],
    [106, 200, 201, 300],
  ],
};

export function pollutantAQI(parameter: string, value: number): number | null {
  const breakpoints = EPA_BREAKPOINTS[parameter];
  if (!breakpoints || !Number.isFinite(value)) return null;
  for (const [cLow, cHigh, aLow, aHigh] of breakpoints) {
    if (value >= cLow && value <= cHigh) {
      return Math.round(((aHigh - aLow) / (cHigh - cLow)) * (value - cLow) + aLow);
    }
  }
  return null;
}

export function aqiCategory(aqi: number | null): string {
  if (aqi === null) return "No data";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy (Sensitive)";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

export function parseOpenAQAqi(results: OpenAQMeasurement[]): AirQuality {
  const byParam = new Map<string, number>();
  for (const m of results) {
    const name = (m.parameter?.name ?? "").toLowerCase();
    if (typeof m.value === "number") byParam.set(name, m.value);
  }

  const parts = {
    pm25: byParam.get("pm25") ?? null,
    pm10: byParam.get("pm10") ?? null,
    no2: byParam.get("no2") ?? null,
    o3: byParam.get("o3") ?? null,
  };

  const subAqis = Object.entries(parts)
    .map(([param, value]) => (value === null ? null : pollutantAQI(param, value)))
    .filter((v): v is number => v !== null);

  const aqi = subAqis.length ? Math.max(...subAqis) : null;

  return {
    ...parts,
    aqi,
    aqi_category: aqiCategory(aqi),
    source: "openaq",
    stations: results.length,
  };
}

/**
 * Fetch latest air quality readings within `radiusMeters` of a point.
 * Requires OPENAQ_API_KEY (X-API-Key header).
 */
export async function fetchAirQuality(
  lat: number,
  lon: number,
  radiusMeters = 25000,
): Promise<AirQuality> {
  const key = import.meta.env.VITE_OPENAQ_API_KEY;
  if (!key) {
    return emptyAirQuality();
  }

  const url =
    `${BASE}/measurements/latest?coordinates=${lat},${lon}` +
    `&radius=${radiusMeters}&limit=300`;
  const data = await fetchJson<OpenAQLatestResponse>(url, {
    headers: { "X-API-Key": key },
  });

  const results = (data.results ?? [])
    .map((r) => r.found)
    .filter((m): m is OpenAQMeasurement => Boolean(m?.value));

  return parseOpenAQAqi(results);
}

const EMPTY_CATEGORY = "No data";

export function emptyAirQuality(): AirQuality {
  return {
    pm25: null,
    pm10: null,
    no2: null,
    o3: null,
    aqi: null,
    aqi_category: EMPTY_CATEGORY,
    source: "openaq",
    stations: 0,
  };
}

export type { AirQuality };

export function aqiColor(aqi: number | null): string {
  if (aqi === null) return "#64748B";
  if (aqi <= 50) return "#10B981";
  if (aqi <= 100) return "#F59E0B";
  if (aqi <= 150) return "#F97316";
  if (aqi <= 200) return "#EF4444";
  if (aqi <= 300) return "#8B5CF6";
  return "#7F1D1D";
}