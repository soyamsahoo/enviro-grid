import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  Flame,
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
  type RouteMode,
} from "@/lib/exposure";
import type { RouteResult } from "@/lib/routing";
import type { AggregatePayload } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

const ACTIVITY_ORDER: ActivityId[] = ["runner", "cyclist", "walker"];
const ACTIVITY_ICONS: Record<ActivityId, React.ReactNode> = {
  runner: <Zap className="h-3.5 w-3.5" />,
  cyclist: <Bike className="h-3.5 w-3.5" />,
  walker: <Footprints className="h-3.5 w-3.5" />,
};

function RouteRow({
  route,
  seconds,
  fastest,
  highlight,
  tag,
}: {
  route: RouteComparison["routeA"];
  seconds?: number;
  fastest?: boolean;
  highlight?: boolean;
  tag?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 transition-all",
        highlight ? "border-2 shadow-[0_0_24px_-8px]" : "border opacity-80",
      )}
      style={{
        borderColor: route.color + "66",
        background: route.color + "0d",
        boxShadow: highlight ? `0 0 24px -8px ${route.color}99` : undefined,
      }}
    >
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", route.accent.bar)} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: route.color + "22", color: route.color }}
          >
            {route.key === "fastest" ? (
              <Zap className="h-4 w-4" />
            ) : route.key === "dangerous" ? (
              <Flame className="h-4 w-4" />
            ) : (
              <Leaf className="h-4 w-4" />
            )}
          </span>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
              {route.label}
              {tag && (
                <span
                  className="rounded-full border px-1.5 py-px font-mono text-[8px] uppercase tracking-wider"
                  style={{ color: route.color, borderColor: route.color + "55", background: route.color + "15" }}
                >
                  {tag}
                </span>
              )}
            </div>
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

const MODE_LABEL: Record<RouteMode, string> = {
  fastest: "Fastest",
  cleanest: "Cleanest",
  dangerous: "Dangerous",
};

export default function RouteDrawer({
  payload,
  persona,
  open,
  onClose,
  routeMeta,
  routeLoading,
  mode,
}: {
  payload: AggregatePayload | null;
  persona: PersonaId;
  open: boolean;
  onClose: () => void;
  routeMeta?: RouteResult | null;
  routeLoading?: boolean;
  mode: RouteMode;
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
        mode,
      }),
    [payload, persona, minutes, activity, routeMeta, minutesA, mode],
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
              {MODE_LABEL[mode]} route · {persona.replace(/_/g, " ")} · modeled corridors
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

              <RouteRow route={comparison.routeA} fastest highlight={mode === "fastest"} />

              {mode === "dangerous" && comparison.routeD && (
                <RouteRow
                  route={comparison.routeD}
                  highlight
                  tag="most exposure"
                />
              )}

              <RouteRow
                route={comparison.routeB}
                seconds={comparison.extraMinutes}
                highlight={mode === "cleanest"}
              />

              {/* verdict band */}
              {mode === "dangerous" && comparison.routeD ? (
                <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <Flame className="h-5 w-5 shrink-0 text-red-400" />
                  <p className="text-xs leading-relaxed text-red-100">
                    The hotspot corridor spikes your inhaled dose to{" "}
                    <b className="text-red-300">
                      {formatNumber(comparison.routeD.cigarettes, 2)}
                    </b>{" "}
                    cigarette equivalents (+
                    {Math.round(
                      ((comparison.routeD.cigarettes - comparison.routeA.cigarettes) /
                        comparison.routeA.cigarettes) *
                        100,
                    )}
                    % vs fastest) — the{" "}
                    <b className="text-emerald-300">cleanest route cuts it by{" "}
                    {comparison.exposureReductionPct}%</b>.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <Leaf className="h-5 w-5 shrink-0 text-emerald-400" />
                  <p className="text-xs leading-relaxed text-emerald-100">
                    Taking the cleanest route costs{" "}
                    <b className="text-emerald-300">+{comparison.extraMinutes} min</b> but cuts your
                    inhaled dose by{" "}
                    <b className="text-emerald-300">{comparison.exposureReductionPct}%</b> — from{" "}
                    <b className="text-rose-300">{formatNumber(comparison.routeA.cigarettes, 2)}</b>{" "}
                    to{" "}
                    <b className="text-emerald-300">{formatNumber(comparison.routeB.cigarettes, 2)}</b>{" "}
                    cigarette equivalents.
                  </p>
                </div>
              )}

              <p className="rounded-xl border border-grid-border bg-grid-panel2 p-3 font-mono text-[10px] leading-relaxed text-slate-500">
                Dose model: PM2.5 ×{" "}
                {formatNumber(comparison.ventilation.m3perMin * 1000, 0)} L/min (V̇e,{" "}
                {comparison.ventilation.label.toLowerCase()}) × minutes / 22 µg per cigarette.
                Clean corridor {comparison.cleanFactor}× · hotspot corridor {comparison.dangerFactor}×
                street PM2.5.
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