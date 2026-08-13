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
  key: "fastest" | "cleanest";
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

export interface RouteComparison {
  ventilation: { label: string; m3perMin: number };
  activityMinutes: number;
  routeA: RouteOption;
  routeB: RouteOption;
  /** How much cleaner Route B is vs Route A (0–100%). */
  exposureReductionPct: number;
  /** Extra minutes Route B costs vs Route A. */
  extraMinutes: number;
  /** Modeled clean-corridor factor (Route B PM = factor × Route A PM). */
  cleanFactor: number;
}

/**
 * Dual-route comparison for the hero drawer.
 *
 * Model:
 *  - Route A "fastest" follows the main corridor → current street PM2.5.
 *  - Route B "cleanest" detours through green corridors/parks where the
 *    air-quality model estimates cleanFactor × street PM2.5 (default 0.18,
 *    i.e. ~82% less exposure) but costs +3 minutes.
 */
export function computeRoutes(
  payload: AggregatePayload | null,
  personaId: PersonaId,
  activityMinutes: number,
  cleanFactor = 0.18,
): RouteComparison | null {
  const streetPm = payload?.air_quality.pm25 ?? null;
  if (streetPm === null || !Number.isFinite(streetPm)) return null;

  const vent = VENTILATION_RATES[personaId];
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

  const routeA = build("fastest", "Fastest route", activityMinutes, streetPm, "#F43F5E", {
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    bar: "from-rose-500 to-red-600",
    text: "text-rose-300",
  });
  const routeB = build("cleanest", "Cleanest route", activityMinutes + extraMinutes, cleanPm, "#10B981", {
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    bar: "from-emerald-400 to-teal-500",
    text: "text-emerald-300",
  });

  const exposureReductionPct = routeA.cigarettes > 0
    ? Math.round(((routeA.cigarettes - routeB.cigarettes) / routeA.cigarettes) * 100)
    : 0;

  return {
    ventilation: { label: vent.label, m3perMin: vent.m3perMin },
    activityMinutes,
    routeA,
    routeB,
    exposureReductionPct,
    extraMinutes,
    cleanFactor,
  };
}
