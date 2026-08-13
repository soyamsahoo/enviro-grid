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