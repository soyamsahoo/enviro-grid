import type { Microclimate } from "@/lib/types";
import { fetchJson } from "./http";

const BASE = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number | null;
    relative_humidity_2m?: number | null;
    wind_speed_10m?: number | null;
    uv_index?: number | null;
    precipitation_probability?: number | null;
    apparent_temperature?: number | null;
    weather_code?: number | null;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    uv_index?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
}

/** Fetch current microclimate conditions (Open-Meteo, keyless). */
export async function fetchMicroclimate(lat: number, lon: number): Promise<Microclimate> {
  const url =
    `${BASE}?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,uv_index," +
    "precipitation_probability,apparent_temperature,weather_code" +
    "&hourly=temperature_2m,uv_index,precipitation_probability&forecast_hours=24&timezone=auto";

  const data = await fetchJson<OpenMeteoResponse>(url);
  const c = data.current ?? {};

  return {
    temperature_2m: c.temperature_2m ?? null,
    relative_humidity_2m: c.relative_humidity_2m ?? null,
    wind_speed_10m: c.wind_speed_10m ?? null,
    uv_index: c.uv_index ?? null,
    precipitation_probability: c.precipitation_probability ?? null,
    apparent_temperature: c.apparent_temperature ?? null,
    weather_code: c.weather_code ?? null,
    source: "openmeteo",
    hourly: {
      time: data.hourly?.time ?? [],
      temperature_2m: data.hourly?.temperature_2m ?? [],
      uv_index: data.hourly?.uv_index ?? [],
      precipitation_probability: data.hourly?.precipitation_probability ?? [],
    },
  };
}

export function emptyMicroclimate(): Microclimate {
  return {
    temperature_2m: null,
    relative_humidity_2m: null,
    wind_speed_10m: null,
    uv_index: null,
    precipitation_probability: null,
    apparent_temperature: null,
    weather_code: null,
    source: "openmeteo",
  };
}

/**
 * Historical climate baselines from the Open-Meteo Archive API:
 * 30-day daily means for temperature and humidity.
 * Keyless, CORS-enabled.
 */
export async function fetchHistoricalAverages(
  lat: number,
  lon: number,
  days = 30,
): Promise<{ temp_avg_30d: number | null; humidity_avg_30d: number | null }> {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
    "&daily=temperature_2m_mean,relative_humidity_2m_mean&timezone=auto";

  try {
    const data = await fetchJson<{
      daily?: {
        temperature_2m_mean?: (number | null)[];
        relative_humidity_2m_mean?: (number | null)[];
      };
    }>(url);

    const temps = (data.daily?.temperature_2m_mean ?? []).filter((v): v is number => v !== null);
    const hums = (data.daily?.relative_humidity_2m_mean ?? []).filter((v): v is number => v !== null);
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    return {
      temp_avg_30d: avg(temps),
      humidity_avg_30d: avg(hums),
    };
  } catch (err) {
    console.warn("[history] Open-Meteo archive unavailable:", err);
    return { temp_avg_30d: null, humidity_avg_30d: null };
  }
}