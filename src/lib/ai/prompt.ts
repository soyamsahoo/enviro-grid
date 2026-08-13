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
  return {
    location: payload.location,
    fetched_at: payload.fetched_at,
    air_quality: payload.air_quality,
    microclimate: payload.microclimate,
    fire_hotspots: payload.fire_hotspots.length,
    fire_hotspot_list: payload.fire_hotspots.slice(0, 10).map((f) => ({
      frp: Math.round(f.frp * 100) / 100,
      acq_date: f.acq_date,
      confidence: f.confidence,
    })),
    biodiversity: {
      total_occurrences: payload.total_occurrences,
      species_count: payload.biodiversity.length,
      top_species: payload.biodiversity.slice(0, 8).map((s) => ({
        scientificName: s.scientificName,
        commonName: s.commonName ?? null,
        sightings: s.count,
      })),
    },
  };
}

export type { PersonaProfile };
