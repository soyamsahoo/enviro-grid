import type { AqiForecastPoint, Microclimate, RiskLevel } from "@/lib/types";
import { aqiCategory } from "@/lib/services/openaq";

export interface ForecastSlice {
  offsetHours: number;
  label: string;
  time: string;
  us_aqi: number | null;
  aqi_category: string;
  risk: RiskLevel;
  temperature: number | null;
  rain_prob: number | null;
}

/** AQI-driven risk tier for forecast cards. */
export function aqiRisk(aqi: number | null): RiskLevel {
  if (aqi === null) return "Moderate";
  if (aqi <= 50) return "Low";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "High";
  return "Severe";
}

const OFFSETS = [
  { hours: 3, label: "+3 Hours" },
  { hours: 6, label: "+6 Hours" },
  { hours: 12, label: "+12 Hours" },
];

/**
 * Builds +3h / +6h / +12h prediction slices by matching forecast points
 * at (or just after) each offset from now.
 */
export function buildForecastSlices(
  aqiForecast: AqiForecastPoint[],
  microclimate: Microclimate | null,
  now = new Date(),
): ForecastSlice[] {
  const mcTimes = microclimate?.hourly?.time ?? [];

  return OFFSETS.map(({ hours, label }) => {
    const target = now.getTime() + hours * 3600_000;
    let best: AqiForecastPoint | null = null;
    let bestDelta = Infinity;

    for (const point of aqiForecast) {
      const t = new Date(point.time).getTime();
      if (Number.isNaN(t)) continue;
      const delta = Math.abs(t - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = point;
      }
    }

    const mcIndex = best ? mcTimes.indexOf(best.time) : -1;
    const hourly = microclimate?.hourly;

    return {
      offsetHours: hours,
      label,
      time: best?.time ?? "",
      us_aqi: best?.us_aqi ?? null,
      aqi_category: aqiCategory(best?.us_aqi ?? null),
      risk: aqiRisk(best?.us_aqi ?? null),
      temperature:
        mcIndex >= 0 ? (hourly?.temperature_2m?.[mcIndex] ?? null) : null,
      rain_prob:
        mcIndex >= 0 ? (hourly?.precipitation_probability?.[mcIndex] ?? null) : null,
    };
  });
}

export const FORECAST_RISK_COLORS: Record<RiskLevel, string> = {
  Low: "#10B981",
  Moderate: "#F59E0B",
  High: "#F97316",
  Severe: "#EF4444",
};
