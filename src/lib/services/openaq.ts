import type { AirQuality, AqiForecastPoint } from "@/lib/types";
import { fetchJson } from "./http";

/**
 * /api/openaq is served by the Vite dev proxy locally and by the
 * Vercel `api/openaq` serverless function in production, so the same
 * origin-relative path works everywhere.
 */
const BASE = "/api/openaq/v3";

export interface StationAirQuality {
  lat: number;
  lon: number;
  name: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  aqi: number | null;
  aqi_category: string;
}

interface OpenAQLocationV3 {
  id: number;
  name?: string;
  distance?: number;
  coordinates?: { latitude?: number; longitude?: number };
  sensors?: Array<{ id?: number; parameter?: { name?: string; units?: string } }>;
}

interface OpenAQLatestRow {
  value?: number | null;
  sensorsId?: number | null;
}

interface OpenAQLocationsResponse {
  results?: OpenAQLocationV3[];
}

interface OpenAQLatestResponse {
  results?: OpenAQLatestRow[];
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

export function parseOpenAQAqi(results: Array<{ parameter?: { name?: string }; value?: number | null }>): AirQuality {
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
 * Fetches the nearest OpenAQ locations (sorted by distance) together with
 * their latest sensor readings. One locations call + one /latest call per
 * station, resolved in parallel.
 */
export async function fetchStationsWithLatest(
  lat: number,
  lon: number,
  radiusMeters = 50000,
  maxStations = 8,
): Promise<StationAirQuality[]> {
  const key = import.meta.env.VITE_OPENAQ_API_KEY;
  if (!key) return [];

  const auth = { headers: { "X-API-Key": key } };

  const locations = await fetchJson<OpenAQLocationsResponse>(
    `${BASE}/locations?coordinates=${lat},${lon}&radius=${radiusMeters}` +
      `&sort=distance&limit=${maxStations}`,
    auth,
  );
  const locs = (locations.results ?? []).slice(0, maxStations);

  const sensorParam = new Map<number, { name: string; units: string }>();
  for (const loc of locs) {
    for (const s of loc.sensors ?? []) {
      if (s.id === undefined || !s.parameter?.name) continue;
      sensorParam.set(s.id, {
        name: s.parameter.name.toLowerCase(),
        units: (s.parameter.units ?? "").toLowerCase(),
      });
    }
  }

  const withLatest = await Promise.all(
    locs.map(async (loc) => {
      try {
        const data = await fetchJson<OpenAQLatestResponse>(
          `${BASE}/locations/${loc.id}/latest`,
          auth,
        );
        return { loc, rows: data.results ?? [] };
      } catch {
        return { loc, rows: [] };
      }
    }),
  );

  const stations: StationAirQuality[] = [];
  for (const { loc, rows } of withLatest) {
    const values = new Map<string, number>();
    for (const row of rows) {
      const param = sensorParam.get(row.sensorsId ?? -1);
      if (!param || typeof row.value !== "number") continue;
      let value = row.value;
      // Normalize ppm → ppb for o3/no2 so EPA breakpoints apply correctly.
      if ((param.name === "o3" || param.name === "no2") && param.units.includes("ppm")) {
        value *= 1000;
      }
      values.set(param.name, value);
    }
    if (values.size === 0) continue;

    const parsed = parseOpenAQAqi(
      [...values.entries()].map(([name, value]) => ({ parameter: { name }, value })),
    );

    stations.push({
      lat: loc.coordinates?.latitude ?? lat,
      lon: loc.coordinates?.longitude ?? lon,
      name: loc.name ?? `Station ${loc.id}`,
      pm25: parsed.pm25,
      pm10: parsed.pm10,
      no2: parsed.no2,
      o3: parsed.o3,
      aqi: parsed.aqi,
      aqi_category: parsed.aqi_category,
    });
  }

  return stations;
}

/**
 * Fetch latest air quality readings within `radiusMeters` of a point.
 * Tries OpenAQ (via the Vite dev proxy) first; automatically falls back
 * to the Open-Meteo Air Quality API (keyless, CORS-enabled, satellite
 * model) when OpenAQ has no key, returns no stations, or fails.
 */
export async function fetchAirQuality(
  lat: number,
  lon: number,
  radiusMeters = 25000,
): Promise<AirQuality> {
  if (import.meta.env.VITE_OPENAQ_API_KEY) {
    try {
      const stations = await fetchStationsWithLatest(lat, lon, radiusMeters, 8);
      if (stations.length > 0) {
        const worst = [...stations].sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0))[0];
        const nearest = stations[0];
        return {
          pm25: nearest.pm25,
          pm10: nearest.pm10,
          no2: nearest.no2,
          o3: nearest.o3,
          aqi: worst.aqi,
          aqi_category: worst.aqi_category,
          source: "openaq",
          stations: stations.length,
        };
      }
      console.warn("[aq] OpenAQ returned no stations; falling back to Open-Meteo AQ…");
    } catch (err) {
      console.warn("[aq] OpenAQ unavailable or CORS blocked; falling back to Open-Meteo AQ…", err);
    }
  }

  return fetchOpenMeteoAirQuality(lat, lon);
}

/**
 * Open-Meteo Air Quality API — no key, CORS-enabled, US EPA AQI
 * (https://open-meteo.com/en/docs/air-quality-api).
 */
export async function fetchOpenMeteoAirQuality(
  lat: number,
  lon: number,
): Promise<AirQuality> {
  try {
    const data = await fetchJson<{
      current?: {
        us_aqi?: number | null;
        pm2_5?: number | null;
        pm10?: number | null;
        nitrogen_dioxide?: number | null;
        ozone?: number | null;
        carbon_monoxide?: number | null;
        sulphur_dioxide?: number | null;
      };
    }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}` +
        `&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi`,
    );
    const c = data.current ?? {};
    const aqi = c.us_aqi ?? null;
    return {
      pm25: c.pm2_5 ?? null,
      pm10: c.pm10 ?? null,
      no2: c.nitrogen_dioxide ?? null,
      o3: c.ozone ?? null,
      aqi,
      aqi_category: aqiCategory(aqi),
      source: "open-meteo",
      stations: 0,
    };
  } catch (err) {
    console.warn("[aq] Open-Meteo AQ fallback failed:", err);
    return emptyAirQuality();
  }
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

/**
 * Forward AQI forecast from the Open-Meteo Air Quality model
 * (hourly us_aqi + pm2.5) plus yesterday's average AQI, using
 * `past_days=1` for the historical baseline. Keyless, CORS-enabled.
 */
export async function fetchAqiForecast(
  lat: number,
  lon: number,
): Promise<{ forecast: AqiForecastPoint[]; aqi_yesterday_avg: number | null }> {
  try {
    const data = await fetchJson<{
      hourly?: {
        time?: string[];
        us_aqi?: (number | null)[];
        pm2_5?: (number | null)[];
      };
    }>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}` +
        `&longitude=${lon}&past_days=1&forecast_days=2` +
        "&hourly=us_aqi,pm2_5",
    );
    const h = data.hourly ?? {};
    const times = h.time ?? [];
    const aqis = h.us_aqi ?? [];
    const pm25s = h.pm2_5 ?? [];

    // past_days=1 -> first 24 entries are yesterday (local time),
    // the rest are today + forecast horizon.
    const forecast: AqiForecastPoint[] = times.map((time, i) => ({
      time,
      us_aqi: aqis[i] ?? null,
      pm25: pm25s[i] ?? null,
    }));

    const yesterday = aqis
      .slice(0, 24)
      .filter((v): v is number => v !== null);
    const aqi_yesterday_avg = yesterday.length
      ? Math.round(yesterday.reduce((s, v) => s + v, 0) / yesterday.length)
      : null;

    return { forecast, aqi_yesterday_avg };
  } catch (err) {
    console.warn("[aq] AQI forecast unavailable:", err);
    return { forecast: [], aqi_yesterday_avg: null };
  }
}

export function aqiColor(aqi: number | null): string {
  if (aqi === null) return "#64748B";
  if (aqi <= 50) return "#10B981";
  if (aqi <= 100) return "#F59E0B";
  if (aqi <= 150) return "#F97316";
  if (aqi <= 200) return "#EF4444";
  if (aqi <= 300) return "#8B5CF6";
  return "#7F1D1D";
}