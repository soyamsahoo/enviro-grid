import type { PersonaId } from "@/lib/ai/personas";
import type { AggregatePayload } from "@/lib/types";

/**
 * Inhaled toxin mass engine (ENVIROGRID 3.0).
 *
 *   Inhaled PM2.5 (µg) = ambient PM2.5 (µg/m³) × ventilation rate (m³/min) × time (min)
 *   Cigarette equivalent = Inhaled PM2.5 / 22 µg  (1 cigarette ≈ 22 µg PM2.5 inhaled)
 */

/** Mass of PM2.5 in one cigarette-equivalent (µg) — used by the EPA-style
 *  "cigarette smoking equivalent" public-health analogy. */
export const CIGARETTE_EQUIVALENT_UG = 22;

/** Persona-specific minute ventilation (m³/min). */
export const VENTILATION_RATES: Record<
  PersonaId,
  { label: string; m3perMin: number }
> = {
  general_citizen: { label: "Brisk walking", m3perMin: 0.015 },
  athlete: { label: "Running", m3perMin: 0.05 },
  respiratory_patient: { label: "Resting / light activity", m3perMin: 0.008 },
  construction_worker: { label: "Moderate manual labor", m3perMin: 0.03 },
  farmer: { label: "Field work", m3perMin: 0.025 },
};

/**
 * Real-time activity toggle for the dual-route demo. Minute ventilation
 * (V̇e) in litres/min as published for steady-state exercise, e.g.
 * ACSM/WHO reference values: running 45 L/min, cycling 30 L/min,
 * walking 12 L/min. Converted internally to m³/min (÷ 1000).
 */
export const ACTIVITY_LEVELS = {
  runner: { label: "Runner", lperMin: 45 },
  cyclist: { label: "Cyclist", lperMin: 30 },
  walker: { label: "Walker", lperMin: 12 },
} as const;
export type ActivityId = keyof typeof ACTIVITY_LEVELS;

export const ACTIVITY_MINUTES = [5, 15, 30, 60] as const;
export type ActivityMinutes = (typeof ACTIVITY_MINUTES)[number];

export function inhaledPm25(
  pm25: number | null,
  ventRate: number,
  minutes: number,
): number | null {
  if (pm25 === null || !Number.isFinite(pm25) || pm25 < 0) return null;
  return pm25 * ventRate * minutes;
}

export function cigaretteEquivalent(massUg: number | null): number | null {
  if (massUg === null) return null;
  return massUg / CIGARETTE_EQUIVALENT_UG;
}

export interface RouteOption {
  key: "fastest" | "cleanest" | "dangerous";
  label: string;
  minutes: number;
  pm25: number;
  massUg: number;
  cigarettes: number;
  /** UI accent color (hex). */
  color: string;
  /** Tailwind accent classes for chips/borders. */
  accent: { chip: string; bar: string; text: string };
}

/** Which corridor the rider cares about — controls map color + drawer focus. */
export type RouteMode = "fastest" | "cleanest" | "dangerous";

export interface RouteComparison {
  ventilation: { label: string; m3perMin: number };
  activityMinutes: number;
  routeA: RouteOption;
  routeB: RouteOption;
  /** Hotspot-corridor variant (only when mode === "dangerous"). */
  routeD?: RouteOption;
  /** How much cleaner Route B is vs Route A (0–100%). */
  exposureReductionPct: number;
  /** Extra minutes Route B costs vs Route A. */
  extraMinutes: number;
  /** Modeled clean-corridor factor (Route B PM = factor × Route A PM). */
  cleanFactor: number;
  /** Modeled hotspot-corridor factor (Route D PM = factor × Route A PM). */
  dangerFactor: number;
}

export interface RouteComputeOpts {
  /** Real-time activity override (V̇e from ACTIVITY_LEVELS, L/min). */
  activityId?: ActivityId;
  /** Override the street PM2.5 concentration (e.g. live route average). */
  streetPm25?: number | null;
  /** Override Route A duration (e.g. live OSRM duration). */
  minutesA?: number;
  /** Clean-corridor factor (default 0.18 → ~82% less exposure). */
  cleanFactor?: number;
  /** Hotspot-corridor factor (default 1.65 → +65% exposure). */
  dangerFactor?: number;
  /** Which corridor to focus the comparison on. */
  mode?: RouteMode;
}

/**
 * Dual-route comparison for the hero drawer.
 *
 * Model:
 *  - Route A "fastest" follows the main corridor → current street PM2.5.
 *  - Route B "cleanest" detours through green corridors/parks where the
 *    air-quality model estimates cleanFactor × street PM2.5 (default 0.18,
 *    i.e. ~82% less exposure) but costs +3 minutes.
 *
 * Every input (activity, minutes, street PM2.5, mode) flows through the dose
 * equation, so toggles and route drags recompute cigarettes live.
 */
export function computeRoutes(
  payload: AggregatePayload | null,
  personaId: PersonaId,
  activityMinutes: number,
  opts: RouteComputeOpts = {},
): RouteComparison | null {
  const streetPm = opts.streetPm25 ?? payload?.air_quality.pm25 ?? null;
  if (streetPm === null || !Number.isFinite(streetPm) || streetPm < 0) return null;

  const activity = opts.activityId ? ACTIVITY_LEVELS[opts.activityId] : null;
  const vent = activity
    ? { label: activity.label, m3perMin: activity.lperMin / 1000 }
    : VENTILATION_RATES[personaId];
  const minutesA = opts.minutesA ?? activityMinutes;
  const cleanFactor = opts.cleanFactor ?? 0.18;
  const dangerFactor = opts.dangerFactor ?? 1.65;
  const mode = opts.mode ?? "fastest";

  const cleanPm = Math.max(1, Math.round(streetPm * cleanFactor));
  const extraMinutes = 3;

  const build = (
    key: RouteOption["key"],
    label: string,
    minutes: number,
    pm25: number,
    color: string,
    accent: RouteOption["accent"],
  ): RouteOption => {
    const massUg = inhaledPm25(pm25, vent.m3perMin, minutes)!;
    return {
      key,
      label,
      minutes,
      pm25,
      massUg,
      cigarettes: cigaretteEquivalent(massUg)!,
      color,
      accent,
    };
  };

  const routeA = build("fastest", "Fastest route", minutesA, streetPm, "#F43F5E", {
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    bar: "from-rose-500 to-red-600",
    text: "text-rose-300",
  });
  const routeB = build("cleanest", "Cleanest route", minutesA + extraMinutes, cleanPm, "#10B981", {
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    bar: "from-emerald-400 to-teal-500",
    text: "text-emerald-300",
  });
  const routeD =
    mode === "dangerous"
      ? build(
          "dangerous",
          "Dangerous route",
          minutesA,
          Math.round(streetPm * dangerFactor),
          "#EF4444",
          {
            chip: "border-red-500/40 bg-red-500/10 text-red-300",
            bar: "from-red-500 to-orange-600",
            text: "text-red-400",
          },
        )
      : undefined;

  const exposureReductionPct = routeA.cigarettes > 0
    ? Math.round(((routeA.cigarettes - routeB.cigarettes) / routeA.cigarettes) * 100)
    : 0;

  return {
    ventilation: { label: vent.label, m3perMin: vent.m3perMin },
    activityMinutes,
    routeA,
    routeB,
    routeD,
    exposureReductionPct,
    extraMinutes,
    cleanFactor,
    dangerFactor,
  };
}
