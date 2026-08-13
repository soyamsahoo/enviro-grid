import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  Footprints,
  Leaf,
  Loader2,
  MapPin,
  Route,
  Timer,
  X,
  Zap,
} from "lucide-react";
import type { PersonaId } from "@/lib/ai/personas";
import {
  ACTIVITY_LEVELS,
  computeRoutes,
  type ActivityId,
  type RouteComparison,
} from "@/lib/exposure";
import type { RouteResult, LatLng } from "@/lib/routing";
import type { AggregatePayload } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import RouteForm from "@/components/routes/RouteForm";

const ACTIVITY_ORDER: ActivityId[] = ["runner", "cyclist", "walker"];
const ACTIVITY_ICONS: Record<ActivityId, React.ReactNode> = {
  runner: <Zap className="h-3.5 w-3.5" />,
  cyclist: <Bike className="h-3.5 w-3.5" />,
  walker: <Footprints className="h-3.5 w-3.5" />,
};

function RouteRow({ route, seconds, fastest }: { route: RouteComparison["routeA"]; seconds?: number; fastest?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4"
      style={{ borderColor: route.color + "44", background: route.color + "0d" }}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r",
          route.accent.bar,
        )}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: route.color + "22", color: route.color }}
          >
            {route.key === "fastest" ? <Zap className="h-4 w-4" /> : <Leaf className="h-4 w-4" />}
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-100">{route.label}</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <Timer className="h-3 w-3" />
              {route.minutes} min
              {seconds ? ` · +${seconds} min extra` : ""}
              {fastest && <span className="text-cyan-400">fastest</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular-nums" style={{ color: route.color }}>
            {formatNumber(route.cigarettes, 2)}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">cigarettes</div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 font-mono text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span>Inhaled PM2.5</span>
          <span className="text-slate-200">{formatNumber(route.massUg, 1)} µg</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Route concentration</span>
          <span className="text-slate-200">{formatNumber(route.pm25, 1)} µg/m³</span>
        </div>
      </div>

      {/* relative exposure bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/70">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", route.accent.bar)}
          style={{ width: `${Math.max(6, Math.min(100, (route.cigarettes / (route.cigarettes + 1)) * 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function RouteDrawer({
  payload,
  persona,
  open,
  onClose,
  routeMeta,
  routeLoading,
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
}: {
  payload: AggregatePayload | null;
  persona: PersonaId;
  open: boolean;
  onClose: () => void;
  routeMeta?: RouteResult | null;
  routeLoading?: boolean;
  origin?: LatLng;
  destination?: LatLng;
  onOriginChange?: (p: LatLng) => void;
  onDestinationChange?: (p: LatLng) => void;
}) {
  const [minutes, setMinutes] = useState(15);
  const [activity, setActivity] = useState<ActivityId>("walker");

  const live = Boolean(routeMeta?.coords.length);
  const minutesA = routeMeta ? Math.max(1, Math.round(routeMeta.durationMin)) : minutes;

  const comparison = useMemo(
    () =>
      computeRoutes(payload, persona, minutes, {
        activityId: activity,
        streetPm25: routeMeta?.avgPm25 ?? undefined,
        minutesA,
      }),
    [payload, persona, minutes, activity, routeMeta, minutesA],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* scrim */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      {/* drawer */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-grid-border bg-grid-panel/95 shadow-2xl backdrop-blur transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-grid-border bg-gradient-to-r from-rose-500/10 via-transparent to-emerald-500/10 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <Route className="h-4 w-4 text-emerald-400" />
              Route Comparison
            </h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Inhaled dose · {persona.replace(/_/g, " ")} · modeled clean corridors
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-grid-border p-2 text-slate-500 transition-colors hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {/* From/To route form — change origin or destination and the dose
              re-integrates along the new OSRM geometry in real time */}
          {origin && destination && onOriginChange && onDestinationChange && (
            <RouteForm
              origin={origin}
              destination={destination}
              onOriginChange={onOriginChange}
              onDestinationChange={onDestinationChange}
            />
          )}

          {/* Dynamic activity toggle (V̇e in L/min) — recomputes the dose live */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Dynamic activity · minute ventilation
              </span>
              <span className="font-mono text-[10px] text-emerald-400">
                V̇e = {ACTIVITY_LEVELS[activity].lperMin} L/min
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {ACTIVITY_ORDER.map((a) => (
                <button
                  key={a}
                  onClick={() => setActivity(a)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 transition-all",
                    activity === a
                      ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_16px_-6px_rgba(16,185,129,0.6)]"
                      : "border-grid-border text-slate-500 hover:border-slate-600 hover:text-slate-300",
                  )}
                >
                  <span className={cn(activity === a && "text-emerald-300")}>
                    {ACTIVITY_ICONS[a]}
                  </span>
                  <span className="text-xs font-medium text-slate-200">
                    {ACTIVITY_LEVELS[a].label}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
                    {ACTIVITY_LEVELS[a].lperMin} L/min
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!comparison ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-grid-border text-sm text-slate-500">
              No PM2.5 data yet — wait for the feeds to load.
            </div>
          ) : (
            <>
              {/* live map route meta */}
              {live ? (
                <div className="flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                  {routeLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5" />
                  )}
                  <span>
                    Live map route · {formatNumber(routeMeta!.distanceKm, 1)} km ·{" "}
                    {Math.round(routeMeta!.durationMin)} min — drag the pins to reroute
                  </span>
                </div>
              ) : (
                /* fallback duration selector (no live route yet) */
                <div className="flex items-center gap-1">
                  {[5, 15, 30, 60].map((m) => (
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
              )}

              <RouteRow route={comparison.routeA} fastest />
              <RouteRow
                route={comparison.routeB}
                seconds={comparison.extraMinutes}
              />

              {/* verdict band */}
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <Leaf className="h-5 w-5 shrink-0 text-emerald-400" />
                <p className="text-xs leading-relaxed text-emerald-100">
                  Taking the cleanest route costs{" "}
                  <b className="text-emerald-300">+{comparison.extraMinutes} min</b> but cuts your
                  inhaled dose by{" "}
                  <b className="text-emerald-300">{comparison.exposureReductionPct}%</b> — from{" "}
                  <b className="text-rose-300">{formatNumber(comparison.routeA.cigarettes, 2)}</b> to{" "}
                  <b className="text-emerald-300">{formatNumber(comparison.routeB.cigarettes, 2)}</b>{" "}
                  cigarette equivalents.
                </p>
              </div>

              <p className="rounded-xl border border-grid-border bg-grid-panel2 p-3 font-mono text-[10px] leading-relaxed text-slate-500">
                Dose model: PM2.5 ×{" "}
                {formatNumber(comparison.ventilation.m3perMin * 1000, 0)} L/min (V̇e,{" "}
                {comparison.ventilation.label.toLowerCase()}) × minutes / 22 µg per cigarette.
                Clean corridor factor: {comparison.cleanFactor}× street PM2.5.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-grid-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-slate-600">
          <Footprints className="h-3.5 w-3.5" />
          ENVIROGRID 3.0 · dual-route dose modeling
        </div>
      </aside>
    </>
  );
}