import type { AggregatePayload, PersonaScore, RiskLevel } from "@/lib/types";
import type { PersonaId } from "./personas";
import { PERSONA_PROFILES } from "./personas";
import { buildChatExtras, buildCopilotPrompt, compactPayload } from "./prompt";
import { cigaretteEquivalent, inhaledPm25, VENTILATION_RATES } from "@/lib/exposure";

export interface CopilotResult {
  score: PersonaScore;
  fromLLM: boolean;
  provider?: "gemini" | "openai" | "local";
}

/**
 * Extra live context the conversational copilot can ground answers in:
 * route dose modeling (cigarette equivalents), live map route meta, and
 * triggered alert rules.
 */
export interface CopilotChatExtras {
  routes?: {
    ventilationLabel: string;
    activityMinutes: number;
    mode: string;
    routeA: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number };
    routeB: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number };
    routeD?: { label: string; minutes: number; pm25: number; massUg: number; cigarettes: number } | null;
    exposureReductionPct: number;
    extraMinutes: number;
    cleanFactor: number;
    dangerFactor: number;
  } | null;
  routeMeta?: {
    distanceKm: number;
    durationMin: number;
    avgPm25: number | null;
    from?: { lat: number; lon: number };
    to?: { lat: number; lon: number };
  } | null;
  alerts?: string[];
}

const RISK_LEVELS: RiskLevel[] = ["Low", "Moderate", "High", "Severe"];

/** Current Gemini model; override via VITE_LLM_MODEL. */
const GEMINI_MODEL = import.meta.env.VITE_LLM_MODEL ?? "gemini-3-flash-preview";

/**
 * Gemini Interactions endpoint — always same-origin: the Vite dev proxy
 * and the Vercel `api/gemini` serverless function both serve /api/gemini,
 * because Google's endpoint rejects browser CORS preflights (403, no ACAO).
 */
const GEMINI_BASE = "/api/gemini";

/**
 * Persona-based AI copilot. Returns a strict-JSON PersonaScore.
 * Uses Gemini 1.5 Flash / OpenAI when LLM_API_KEY is set; otherwise
 * falls back to a deterministic local scorer so the app stays functional.
 */
export async function generatePersonaScore(
  payload: AggregatePayload,
  personaId: PersonaId,
): Promise<CopilotResult> {
  if (import.meta.env.VITE_LLM_API_KEY) {
    const provider: "gemini" | "openai" =
      (import.meta.env.VITE_LLM_PROVIDER ?? "gemini").toLowerCase() === "openai"
        ? "openai"
        : "gemini";
    try {
      const raw = await runLLMText(buildCopilotPrompt(payload, personaId), { json: true });
      return { score: sanitizeScore(parseJsonScore(raw)), fromLLM: true, provider };
    } catch (err) {
      console.warn("[copilot] LLM failed, using local fallback:", err);
    }
  }

  return { score: localScore(payload, personaId), fromLLM: false, provider: "local" };
}

// ---------------------------------------------------------------------------
// LLM execution (Gemini Interactions API + OpenAI chat completions)
// ---------------------------------------------------------------------------

/** Raw-text LLM call shared by the JSON scorer and the chat interface. */
export async function runLLMText(
  prompt: string,
  opts?: { json?: boolean; temperature?: number },
): Promise<string> {
  const key = import.meta.env.VITE_LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY not configured");

  const provider: "gemini" | "openai" =
    (import.meta.env.VITE_LLM_PROVIDER ?? "gemini").toLowerCase() === "openai"
      ? "openai"
      : "gemini";
  const json = opts?.json ?? false;

  if (provider === "openai") {
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: opts?.temperature ?? 0.2,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(describeLLMError("OpenAI", res.status));
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  const res = await fetchWithRetry(`${GEMINI_BASE}/v1beta/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      store: false,
      input: [{ type: "text", text: prompt }],
      ...(json ? { response_format: { type: "text", mime_type: "application/json" } } : {}),
      generation_config: { thinking_level: "low" },
    }),
  });
  if (!res.ok) throw new Error(describeLLMError("Gemini", res.status));
  const data = await res.json();
  const text = extractInteractionText(data);
  if (!text) throw new Error("Gemini returned no text content");
  return text;
}

/** Retries transient LLM errors (429 rate-limit / 5xx) with exponential backoff. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  return last!;
}

/** Human-readable, actionable LLM error message keyed to the HTTP status. */
function describeLLMError(provider: string, status: number): string {
  if (status === 429) {
    return `${provider} 429 — rate limit / quota exceeded. Wait a minute and retry, or check your ${provider} quota.`;
  }
  if (status === 401 || status === 403) {
    return `${provider} ${status} — API key rejected. Check LLM_API_KEY / VITE_LLM_API_KEY.`;
  }
  return `${provider} ${status}`;
}

/**
 * Conversational copilot: answers an arbitrary user question about the
 * active location, grounding every claim in the live payload JSON.
 */
export async function copilotChat(
  payload: AggregatePayload,
  personaId: PersonaId,
  question: string,
  extras?: CopilotChatExtras,
): Promise<string> {
  const profile = PERSONA_PROFILES[personaId];
  const prompt =
    `You are ENVIROGRID's conversational environmental copilot for the "${profile.label}" persona.\n` +
    `Answer the user's question conversationally and concisely (max ~120 words).\n` +
    `Rules:\n` +
    `- Only use the measured values in the payload below. If the data cannot answer the question, say so plainly.\n` +
    `- Quote concrete values (e.g. "AQI 63", "PM2.5 at 42 µg/m³", "UV 7") when relevant.\n` +
    `- You ALSO see route dose modeling (cigarette equivalents), live map route meta and triggered alerts — use them whenever the question touches commuting, journey planning, cigarettes, or personal exposure.\n` +
    `- Give one-line actionable advice tied to the persona.\n` +
    `- Never invent numbers, forecasts, or causal links.\n\n` +
    `PERSONA: ${profile.label}\n` +
    `LOCATION: ${payload.location.name ?? `${payload.location.lat.toFixed(3)}, ${payload.location.lon.toFixed(3)}`}\n` +
    `LIVE PAYLOAD:\n${JSON.stringify(compactPayload(payload), null, 2)}` +
    buildChatExtras(
      extras
        ? {
            routes: extras.routes ?? null,
            routeMeta: extras.routeMeta ?? null,
            alerts: extras.alerts,
          }
        : null,
    ) +
    `\n\nUSER QUESTION: ${question}`;

  return runLLMText(prompt).catch((err) => {
    console.warn("[copilot] chat LLM unavailable, using grounded local answer:", err);
    return localChatAnswer(payload, personaId, question, extras);
  });
}

/**
 * Deterministic, payload-grounded chat answer used when the LLM is
 * unavailable (no key, rate-limited, or down) so the copilot never dead-ends.
 * Builds a concise markdown summary from the measured values the model
 * would otherwise see.
 */
function localChatAnswer(
  payload: AggregatePayload,
  personaId: PersonaId,
  question: string,
  extras?: CopilotChatExtras,
): string {
  const profile = PERSONA_PROFILES[personaId];
  const aq = payload.air_quality;
  const mc = payload.microclimate;
  const q = question.toLowerCase();
  const lines: string[] = [];

  const want = (keys: string[]) => keys.some((k) => q.includes(k));
  const wantsCigarettes = want(["cigarette", "cigar", "smoke"]);
  const wantsRoute = want(["route", "commute", "bike", "cycling", "cycle", "run", "drive", "travel", "journey"]);

  if (wantsCigarettes || wantsRoute) {
    if (extras?.routes) {
      const r = extras.routes;
      const row = (o: { label: string; minutes: number; pm25: number; cigarettes: number }) =>
        `- **${o.label}**: ${o.minutes} min · ${o.pm25} µg/m³ → **${o.cigarettes.toFixed(2)} cigarettes**`;
      lines.push(
        `**Route exposure (${r.mode}, ${r.ventilationLabel}, ${r.activityMinutes} min):**`,
        row(r.routeA),
        ...(r.routeD ? [row(r.routeD)] : []),
        row(r.routeB),
        `The cleanest corridor cuts your dose by **${r.exposureReductionPct}%** for **+${r.extraMinutes} min**. (1 cigarette ≈ 22 µg inhaled PM2.5.)`,
      );
    } else if (aq.pm25 !== null) {
      const vent = VENTILATION_RATES[personaId];
      const cigs = cigaretteEquivalent(inhaledPm25(aq.pm25, vent.m3perMin, 15));
      lines.push(`**Inhaled dose estimate:** with ${vent.label.toLowerCase()} (${vent.m3perMin * 1000} L/min) over 15 min at PM2.5 ${aq.pm25} µg/m³ → **${cigs?.toFixed(2) ?? "—"} cigarette equivalents**.`);
    } else {
      lines.push("No PM2.5 measurement is available yet, so a dose estimate isn't possible.");
    }
  }

  if (lines.length < 2) {
    const facts: string[] = [];
    if (aq.aqi !== null) facts.push(`AQI **${aq.aqi}** (${aq.aqi_category})${aq.pm25 !== null ? `, PM2.5 **${aq.pm25} µg/m³**` : ""}`);
    if (mc.temperature_2m !== null) facts.push(`**${mc.temperature_2m}°C**${mc.apparent_temperature !== null ? ` (feels ${mc.apparent_temperature}°C)` : ""}`);
    if (mc.relative_humidity_2m !== null) facts.push(`humidity **${mc.relative_humidity_2m}%**`);
    if (mc.uv_index !== null) facts.push(`UV **${mc.uv_index}**`);
    if (mc.precipitation_probability !== null) facts.push(`rain **${mc.precipitation_probability}%**`);
    if (payload.fire_hotspots.length) facts.push(`**${payload.fire_hotspots.length} active fire detection(s)** nearby`);
    if (payload.biodiversity.length) facts.push(`**${payload.biodiversity.length} species** catalogued nearby`);
    lines.push(`Current conditions: ${facts.length ? facts.join(" · ") : "no live readings within range yet"}.`);
  }

  const advice = localScore(payload, personaId).actionable_advice.slice(0, 2);
  lines.push(`**For your ${profile.label} profile:** ${advice.join(" ")}`);

  return (
    lines.join("\n\n") +
    "\n\n> Local analysis — the live LLM is temporarily unavailable (quota or rate limit); this summary is computed from the measured payload."
  );
}

/** Reads model output from an Interactions API response (steps timeline). */
function extractInteractionText(data: {
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  const parts: string[] = [];
  for (const step of data.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "text" && block.text) parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonScore(raw: string): PersonaScore {
  const cleaned = raw
    .replace(/```(?:json)?/g, "")
    .trim()
    .replace(/^```/, "")
    .replace(/```$/, "");
  const parsed = JSON.parse(cleaned) as Partial<PersonaScore>;
  return sanitizeScore(parsed);
}

// ---------------------------------------------------------------------------
// Strict schema sanitization — never let malformed LLM output reach the UI
// ---------------------------------------------------------------------------

export function sanitizeScore(parsed: Partial<PersonaScore> | null | undefined): PersonaScore {
  const num = (v: unknown) => {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
  };
  const risk: RiskLevel = RISK_LEVELS.includes(parsed?.risk_level as RiskLevel)
    ? (parsed!.risk_level as RiskLevel)
    : riskFromScore(num(parsed?.persona_health_score));

  const str = (v: unknown, fallback = "") =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

  const advice = Array.isArray(parsed?.actionable_advice)
    ? parsed!.actionable_advice.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    : [];

  return {
    persona_health_score: num(parsed?.persona_health_score),
    risk_level: risk,
    headline: str(parsed?.headline, "Current conditions summarized."),
    primary_factor: str(parsed?.primary_factor, "Multiple factors"),
    verified_why: str(
      parsed?.verified_why,
      "Verification data is limited at this location; treating conditions as neutral.",
    ),
    actionable_advice: advice.length
      ? advice
      : ["Stay informed on local advisories."],
    forecast_summary: str(parsed?.forecast_summary, ""),
  };
}

export function riskFromScore(score: number): RiskLevel {
  if (score >= 75) return "Low";
  if (score >= 50) return "Moderate";
  if (score >= 30) return "High";
  return "Severe";
}

// ---------------------------------------------------------------------------
// Deterministic local scorer (keyless fallback) — transparent, weighted math
// ---------------------------------------------------------------------------

export function localScore(payload: AggregatePayload, personaId: PersonaId): PersonaScore {
  const profile = PERSONA_PROFILES[personaId];
  const factors = factorSubscores(payload);

  const weighted = Object.entries(profile.weights)
    .filter(([, w]) => w > 0)
    .map(([name, w]) => ({ name, w, sub: factors[name as keyof typeof factors] }));

  const totalWeight = weighted.reduce((s, f) => s + f.w, 0) || 1;
  const score = Math.round(
    weighted.reduce((s, f) => s + f.sub * f.w, 0) / totalWeight,
  );

  const worst = [...weighted].sort((a, b) => a.sub - b.sub)[0];
  const factorLabel = factorLabelMap[worst.name] ?? worst.name;

  return {
    persona_health_score: score,
    risk_level: riskFromScore(score),
    headline: `${profile.label} conditions: ${factorLabel.toLowerCase()} is the key constraint today`,
    primary_factor: factorLabel,
    verified_why: verifiedWhyText(payload, worst.name, factorLabel),
    actionable_advice: adviceFor(personaId, worst.name, payload),
    forecast_summary: buildForecastSummary(payload),
  };
}

/** 0–100 health subscore per factor; 100 = ideal. */
function factorSubscores(payload: AggregatePayload) {
  const aq = payload.air_quality;
  const mc = payload.microclimate;
  const fires = payload.fire_hotspots.length;
  const species = payload.biodiversity.length;

  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

  const pm25 = aq.pm25 === null ? 75 : clamp(100 - (aq.pm25 / 35.5) * 100);
  const pm10 = aq.pm10 === null ? 75 : clamp(100 - (aq.pm10 / 155) * 100);
  const aqi = aq.aqi === null ? 75 : clamp(100 - aq.aqi / 5);
  const temp = mc.temperature_2m;
  const temperature = clamp(
    temp === null
      ? 80
      : temp >= 18 && temp <= 27
        ? 100
        : temp > 27
          ? 100 - (temp - 27) * 4.5
          : temp < 5
            ? 100 - (5 - temp) * 3
            : 100 - (18 - temp) * 2,
  );
  const humidity = clamp(mc.relative_humidity_2m === null ? 80 : 100 - Math.abs(mc.relative_humidity_2m - 50) * 1.6);
  const heatSource = mc.apparent_temperature ?? mc.temperature_2m;
  const heatIndex = clamp(
    heatSource === null
      ? 80
      : heatSource >= 18 && heatSource <= 27
        ? 100
        : heatSource > 27
          ? 100 - (heatSource - 27) * 4.5
          : heatSource < 5
            ? 100 - (5 - heatSource) * 3
            : 100 - (18 - heatSource) * 2,
  );
  const uv = mc.uv_index === null ? 90 : clamp(100 - mc.uv_index * 8.5);
  const rain = clamp(mc.precipitation_probability === null ? 75 : 100 - Math.abs(mc.precipitation_probability - 20) * 1.5);
  const fire = fires === 0 ? 100 : clamp(100 - fires * 12);
  const biodiversity = clamp(species * 8 + 20);

  return { pm25, pm10, aqi, heatIndex, humidity, uv, rain, temperature, fire, biodiversity };
}

const factorLabelMap: Record<string, string> = {
  pm25: "PM2.5 particulates",
  pm10: "PM10 particulates",
  aqi: "Air Quality Index",
  heatIndex: "Heat index",
  humidity: "Humidity",
  uv: "UV radiation",
  rain: "Rain probability",
  temperature: "Temperature",
  fire: "Active fire alerts",
  biodiversity: "Biodiversity richness",
};

function verifiedWhyText(payload: AggregatePayload, factor: string, label: string): string {
  const aq = payload.air_quality;
  const mc = payload.microclimate;
  const parts: string[] = [];

  if (aq.pm25 !== null && factor !== "pm25") parts.push(`PM2.5 measured at ${aq.pm25} µg/m³`);
  if (aq.aqi !== null) parts.push(`overall AQI is ${aq.aqi} (${aq.aqi_category})`);
  if (mc.temperature_2m !== null) parts.push(`temperature ${mc.temperature_2m}°C`);
  if (mc.apparent_temperature !== null) parts.push(`feels like ${mc.apparent_temperature}°C`);
  if (mc.relative_humidity_2m !== null) parts.push(`humidity ${mc.relative_humidity_2m}%`);
  if (mc.uv_index !== null) parts.push(`UV index ${mc.uv_index}`);
  if (payload.fire_hotspots.length) parts.push(`${payload.fire_hotspots.length} active fire detection(s) within 25 km`);

  const observed = parts.length ? parts.join("; ") : "no station readings within range";
  return `Local readings — ${observed} — weigh most heavily on ${label.toLowerCase()} for your profile. These are measured values from live feeds, not inferred causes.`;
}

function adviceFor(personaId: PersonaId, factor: string, payload: AggregatePayload): string[] {
  const advice: string[] = [];
  const aq = payload.air_quality;
  const rainProb = payload.microclimate.precipitation_probability;

  if (factor === "pm25" || factor === "pm10" || factor === "aqi") {
    advice.push(aq.pm25 && aq.pm25 > 35 ? "Wear an N95 mask outdoors and avoid high-exertion routes." : "Use quieter backstreets away from traffic to lower particulate exposure.");
  }
  if (factor === "heatIndex") advice.push("Take breaks in shade every 45 minutes and drink water proactively.");
  if (factor === "uv") advice.push("Apply SPF 30+ and seek shade between 10:00–16:00.");
  if (factor === "rain") advice.push(rainProb && rainProb > 40 ? "Carry rain protection; wet conditions may affect travel or fieldwork." : "No significant rain expected — good for outdoor plans.");
  if (factor === "fire") advice.push(payload.fire_hotspots.length ? "Monitor air quality if wind shifts smoke toward your location." : "No active fire alerts within 25 km.");
  if (personaId === "respiratory_patient") advice.push("Keep rescue inhaler accessible if heading outdoors.");
  if (personaId === "athlete") advice.push("Warm up 5 extra minutes in cooler conditions.");
  if (personaId === "farmer" && factor === "biodiversity") advice.push("High biodiversity nearby — pollinator activity should support nearby crops.");

  return [...new Set(advice)].slice(0, 5);
}

function buildForecastSummary(payload: AggregatePayload): string {
  const mc = payload.microclimate;
  const bits: string[] = [];
  if (mc.temperature_2m !== null) bits.push(`${mc.temperature_2m}°C`);
  if (mc.precipitation_probability !== null)
    bits.push(`${mc.precipitation_probability}% rain probability`);
  if (mc.wind_speed_10m !== null) bits.push(`wind ${mc.wind_speed_10m} km/h`);
  if (payload.fire_hotspots.length) bits.push(`${payload.fire_hotspots.length} fire alerts nearby`);
  return bits.length
    ? `Short-term outlook: ${bits.join(", ")}.`
    : "Short-term outlook: conditions stable.";
}