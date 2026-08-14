import type { AggregatePayload } from "@/lib/types";
import type { PersonaId, PersonaProfile } from "./personas";
import { PERSONA_PROFILES } from "./personas";

/**
 * Builds a strict-JSON prompt for the LLM.
 * The prompt guarantees structured output by declaring the exact schema,
 * the persona weighting matrix, and the "Verified Why" constraints.
 */
export function buildCopilotPrompt(
  payload: AggregatePayload,
  personaId: PersonaId,
): string {
  const profile = PERSONA_PROFILES[personaId];
  const compact = compactPayload(payload);

  return `You are ENVIROGRID's "Verified Why" intelligence engine — an environmental health copilot.
You NEVER hallucinate causal links. Every statement about an anomaly must trace back to the measured values in the payload below, and you must name the specific measured value that supports each claim. If a factor is missing from the data, say so and exclude it from "verified_why".

TASK: Score environmental health for the persona below, for this exact location, and return STRICT JSON.

PERSONA: ${profile.label}
PERSONA WEIGHTS (used to weight factors in the score):
${JSON.stringify(profile.weights, null, 2)}

ENVIRONMENTAL PAYLOAD (measured, real-time):
${JSON.stringify(compact, null, 2)}

SCORING RULES:
- Compute a health score 0-100 where 100 = ideal conditions for this persona.
- Apply the persona weights above to the relevant factors (e.g. PM2.5, heat index, UV, rain probability, AQI, fire alerts, biodiversity richness).
- risk_level mapping: score >= 75 "Low", 50-74 "Moderate", 30-49 "High", < 30 "Severe".
- headline: one punchy sentence (max 12 words) summarizing the situation.
- primary_factor: the single most influential factor for this persona right now.
- verified_why: 2-3 sentences of analysis. MUST quote the measured values (e.g. "PM2.5 measured at 42 µg/m³..."). Only cite values present in the payload. Do not invent causes.
- actionable_advice: 3-5 concrete, persona-specific recommendations.
- forecast_summary: one sentence using the payload's current conditions.

OUTPUT ONLY JSON, no markdown fences, no commentary. Schema:
{
  "persona_health_score": number 0-100,
  "risk_level": "Low" | "Moderate" | "High" | "Severe",
  "headline": string,
  "primary_factor": string,
  "verified_why": string,
  "actionable_advice": string[],
  "forecast_summary": string
}`;
}

export function compactPayload(payload: AggregatePayload) {
  const mc = payload.microclimate;
  return {
    location: payload.location,
    fetched_at: payload.fetched_at,
    air_quality: payload.air_quality,
    microclimate: {
      ...mc,
      hourly: mc.hourly
        ? {
            time: mc.hourly.time.slice(0, 12),
            temperature_2m: mc.hourly.temperature_2m.slice(0, 12),
            uv_index: mc.hourly.uv_index.slice(0, 12),
            precipitation_probability: mc.hourly.precipitation_probability.slice(0, 12),
          }
        : undefined,
    },
    fire_hotspots: payload.fire_hotspots.length,
    fire_hotspot_list: payload.fire_hotspots.slice(0, 20).map((f) => ({
      lat: Math.round(f.lat * 1000) / 1000,
      lon: Math.round(f.lon * 1000) / 1000,
      frp: Math.round(f.frp * 100) / 100,
      acq_date: f.acq_date,
      acq_time: f.acq_time,
      confidence: f.confidence,
      satellite: f.satellite,
    })),
    biodiversity: {
      total_occurrences: payload.total_occurrences,
      species_count: payload.biodiversity.length,
      top_species: payload.biodiversity.slice(0, 15).map((s) => ({
        scientificName: s.scientificName,
        commonName: s.commonName ?? null,
        sightings: s.count,
      })),
    },
    taxonomy: payload.taxonomy,
    aqi_forecast: payload.aqi_forecast.slice(0, 24).map((p) => ({
      time: p.time,
      us_aqi: p.us_aqi,
      pm25: p.pm25,
    })),
    history: payload.history,
  };
}

/**
 * Extra live context the chat can see beyond the environmental payload:
 * route dose modeling (cigarette equivalents), live map route meta, and
 * user-configured alerts that are currently triggered.
 */
export function buildChatExtras(
  extras: {
    routes?: {
      ventilationLabel?: string;
      activityMinutes?: number;
      mode?: string;
      routeA?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number };
      routeB?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number };
      routeD?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number } | null;
      exposureReductionPct?: number;
      extraMinutes?: number;
      cleanFactor?: number;
      dangerFactor?: number;
    } | null;
    routeMeta?: {
      distanceKm: number;
      durationMin: number;
      avgPm25: number | null;
      from?: { lat: number; lon: number };
      to?: { lat: number; lon: number };
    } | null;
    alerts?: string[];
  } | null,
): string {
  if (!extras) return "";
  const sections: string[] = [];

  const routeLine = (r?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number } | null) =>
    r
      ? `${r.label}: ${r.minutes} min at ${r.pm25} µg/m³ → inhaled ${Math.round(r.massUg * 100) / 100} µg PM2.5 = ${Math.round(r.cigarettes * 100) / 100} cigarette equivalents`
      : null;

  if (extras.routeMeta) {
    sections.push(
      "LIVE MAP ROUTE (origin→destination, OSRM + AQI-grid dose integration):\n" +
        JSON.stringify(extras.routeMeta, null, 2),
    );
  }

  if (extras.routes) {
    const r = extras.routes;
    const lines: string[] = [];
    lines.push(`ROUTE DOSE COMPARISON (mode: ${r.mode ?? "fastest"}, activity: ${r.ventilationLabel ?? "unknown"}, ${r.activityMinutes ?? 15} min):`);
    for (const l of [routeLine(r.routeA), routeLine(r.routeB), routeLine(r.routeD)]) {
      if (l) lines.push(`- ${l}`);
    }
    if (r.exposureReductionPct !== undefined) {
      lines.push(`- Cleanest route cuts inhaled dose by ${r.exposureReductionPct}% (+${r.extraMinutes} min)`);
    }
    if (r.cleanFactor !== undefined || r.dangerFactor !== undefined) {
      lines.push(`- Model: clean corridor ${r.cleanFactor}× street PM2.5 · hotspot corridor ${r.dangerFactor}× street PM2.5 · 1 cigarette ≈ 22 µg inhaled PM2.5`);
    }
    sections.push(lines.join("\n"));
  }

  if (extras.alerts && extras.alerts.length) {
    sections.push("TRIGGERED ALERTS (user-configured thresholds exceeded):\n" + extras.alerts.join("\n"));
  }

  return sections.length ? "\n\n" + sections.join("\n\n") : "";
}

export type { PersonaProfile };
