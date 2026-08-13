import { useMemo, useState } from "react";
import { Cigarette, Wind, Timer } from "lucide-react";
import type { PersonaId } from "@/lib/ai/personas";
import type { RiskLevel } from "@/lib/types";
import {
  ACTIVITY_MINUTES,
  VENTILATION_RATES,
  cigaretteEquivalent,
  inhaledPm25,
  type ActivityMinutes,
} from "@/lib/exposure";
import { cn, formatNumber } from "@/lib/utils";

const RISK_TEXT: Record<RiskLevel, string> = {
  Low: "Low risk",
  Moderate: "Moderate risk",
  High: "High risk",
  Severe: "Severe risk",
};

export default function ExposureCard({
  pm25,
  persona,
  score,
  riskLevel,
  loading,
}: {
  pm25: number | null;
  persona: PersonaId;
  score: number | null;
  riskLevel?: RiskLevel;
  loading?: boolean;
}) {
  const [minutes, setMinutes] = useState<ActivityMinutes>(15);
  const vent = VENTILATION_RATES[persona];

  const exposure = useMemo(() => {
    const mass = inhaledPm25(pm25, vent.m3perMin, minutes);
    return {
      mass,
      cigarettes: cigaretteEquivalent(mass),
    };
  }, [pm25, vent.m3perMin, minutes]);

  const cig = exposure.cigarettes;
  const cigFrac = cig === null ? 0 : Math.min(1.5, cig);
  const cigColor = cig === null ? "#64748B" : cig < 0.3 ? "#10B981" : cig < 1 ? "#F59E0B" : "#EF4444";

  return (
    <div className="glass flex w-full flex-col rounded-xl p-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          <Cigarette className="h-3.5 w-3.5" /> Inhaled toxin mass
        </div>
        <span className="flex items-center gap-1 rounded-full border border-grid-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <Wind className="h-3 w-3" /> {vent.label} · {formatNumber(vent.m3perMin, 3)} m³/min
        </span>
      </div>

      {loading || pm25 === null ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-500">
          {loading ? "Measuring exposure…" : "No PM2.5 reading for this location"}
        </div>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <div className="font-display text-5xl font-bold tabular-nums" style={{ color: cigColor }}>
              {cig !== null ? formatNumber(cig, 2) : "—"}
            </div>
            <div className="mb-1.5 text-sm text-slate-400">
              cigarettes
              <span className="block text-[11px] text-slate-500">
                ≈ {formatNumber(exposure.mass, 1)} µg PM2.5 inhaled
              </span>
            </div>
          </div>

          {/* cigarette bar visual */}
          <div className="mt-3">
            <div className="flex h-3 w-full items-center overflow-hidden rounded-full bg-slate-800/70">
              <div
                className={cn("h-full rounded-full transition-all duration-700", cigColor === "#10B981" ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : cigColor === "#F59E0B" ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-rose-500 to-red-500")}
                style={{ width: `${Math.min(100, (cigFrac / 1.5) * 100)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-slate-600">
              <span>0</span>
              <span>{vent.label.toLowerCase()}</span>
              <span>1.5+</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              At {formatNumber(pm25, 1)} µg/m³ PM2.5 for{" "}
              <span className="text-slate-200">{minutes}-min</span> exposure
            </span>
            {score !== null && riskLevel && (
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                style={{
                  color: cigColor,
                  borderColor: cigColor + "55",
                  background: cigColor + "18",
                }}
              >
                {RISK_TEXT[riskLevel]} · {score}/100
              </span>
            )}
          </div>
        </>
      )}

      {/* activity-time selector */}
      <div className="mt-4 flex items-center gap-1 border-t border-grid-border pt-3">
        <Timer className="mr-1 h-3.5 w-3.5 text-slate-600" />
        {ACTIVITY_MINUTES.map((m) => (
          <button
            key={m}
            onClick={() => setMinutes(m)}
            className={cn(
              "flex-1 rounded-lg border px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
              minutes === m
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-grid-border text-slate-500 hover:text-slate-300",
            )}
          >
            {m} min
          </button>
        ))}
      </div>
    </div>
  );
}