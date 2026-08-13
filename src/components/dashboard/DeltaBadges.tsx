import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { AggregatePayload } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

interface Delta {
  label: string;
  current: number | null;
  baseline: number | null;
  unit: string;
  lowerIsBetter: boolean;
}

export default function DeltaBadges({ payload }: { payload: AggregatePayload }) {
  const h = payload.history;
  if (!h) return null;

  const deltas: Delta[] = [
    {
      label: "AQI vs yesterday",
      current: payload.air_quality.aqi,
      baseline: h.aqi_yesterday_avg,
      unit: " index",
      lowerIsBetter: true,
    },
    {
      label: "Temp vs 30d mean",
      current: payload.microclimate.temperature_2m,
      baseline: h.temp_avg_30d,
      unit: "°C",
      lowerIsBetter: false,
    },
    {
      label: "Humidity vs 30d mean",
      current: payload.microclimate.relative_humidity_2m,
      baseline: h.humidity_avg_30d,
      unit: "%",
      lowerIsBetter: false,
    },
  ];

  const visible = deltas.filter((d) => d.current !== null && d.baseline !== null);
  if (visible.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Historical deltas
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {visible.map((d) => {
          const diff = d.current! - d.baseline!;
          const worse = d.lowerIsBetter ? diff > 0 : false;
          const better = d.lowerIsBetter ? diff < 0 : false;
          return (
            <div
              key={d.label}
              className="flex items-center justify-between gap-2 rounded-lg border border-grid-border bg-grid-panel2 px-3 py-2"
            >
              <div className="text-[11px] leading-tight text-slate-400">{d.label}</div>
              <div
                className={cn(
                  "flex items-center gap-0.5 font-mono text-sm",
                  better ? "text-emerald-400" : worse ? "text-red-400" : "text-slate-300",
                )}
              >
                {better ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : worse ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
                {diff >= 0 ? "+" : ""}
                {formatNumber(diff, 1)}
                {d.unit}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">
        vs {formatNumber(h.temp_avg_30d ?? 0, 1)}°C / {formatNumber(h.humidity_avg_30d ?? 0, 0)}% 30d baselines
      </div>
    </div>
  );
}