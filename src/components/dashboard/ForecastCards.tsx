import { useMemo } from "react";
import { Clock3, CloudRain, Thermometer, TrendingUp } from "lucide-react";
import type { AggregatePayload } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildForecastSlices, FORECAST_RISK_COLORS } from "@/lib/forecast";
import { formatNumber } from "@/lib/utils";

export default function ForecastCards({ payload }: { payload: AggregatePayload }) {
  const slices = useMemo(
    () => buildForecastSlices(payload.aqi_forecast, payload.microclimate),
    [payload],
  );

  if (slices.every((s) => s.us_aqi === null)) return null;

  const maxAqi = Math.max(...slices.map((s) => s.us_aqi ?? 0), 1);

  const fmtTime = (iso: string) =>
    iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }) : "—";

  return (
    <Card className="relative overflow-hidden border-grid-border neo-glow-cyan">
      {/* Kokonut-style ambient gradient mesh */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

      <CardHeader className="relative pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
          <TrendingUp className="h-4 w-4 text-cyan-400" />
          Forward Forecasting Engine
          <span className="ml-1 font-mono text-[10px] font-normal uppercase tracking-widest text-slate-500">
            Open-Meteo AQ model
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="grid grid-cols-3 gap-3">
          {slices.map((s) => (
            <div
              key={s.offsetHours}
              className="group relative overflow-hidden rounded-xl border border-grid-border bg-grid-panel2 p-3 transition-all hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-xl"
              style={{
                boxShadow: `0 0 28px -14px ${FORECAST_RISK_COLORS[s.risk]}66`,
              }}
            >
              {/* per-slice ambient blob + hairline */}
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl"
                style={{ background: `${FORECAST_RISK_COLORS[s.risk]}22` }}
              />
              <div
                className="h-px w-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${FORECAST_RISK_COLORS[s.risk]}88, transparent)`,
                }}
              />

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  <Clock3 className="h-3 w-3" /> {s.label}
                </span>
                <span className="font-mono text-[10px] text-slate-500">{fmtTime(s.time)}</span>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className="font-display text-2xl font-semibold tabular-nums"
                  style={{
                    color: FORECAST_RISK_COLORS[s.risk],
                    textShadow: `0 0 18px ${FORECAST_RISK_COLORS[s.risk]}55`,
                  }}
                >
                  AQI {s.us_aqi === null ? "—" : Math.round(s.us_aqi)}
                </span>
              </div>
              <div className="text-xs text-slate-400">{s.aqi_category}</div>

              <div
                className="mt-2 inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                style={{
                  color: FORECAST_RISK_COLORS[s.risk],
                  borderColor: FORECAST_RISK_COLORS[s.risk] + "55",
                  background: FORECAST_RISK_COLORS[s.risk] + "15",
                }}
              >
                {s.risk} risk
              </div>

              <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
                {s.temperature !== null && (
                  <span className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-orange-400" />
                    {formatNumber(s.temperature, 1)}°C
                  </span>
                )}
                {s.rain_prob !== null && (
                  <span className="flex items-center gap-1">
                    <CloudRain className="h-3 w-3 text-cyan-400" />
                    {formatNumber(s.rain_prob)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* AQI trajectory mini-chart */}
        <div className="mt-3 flex h-16 items-end gap-1.5 rounded-xl border border-grid-border bg-grid-panel2/60 p-2">
          {slices.map((s) => (
            <div key={s.offsetHours} className="flex h-full flex-1 flex-col items-center">
              <span
                className="font-mono text-[9px] tabular-nums"
                style={{ color: FORECAST_RISK_COLORS[s.risk] }}
              >
                {s.us_aqi === null ? "—" : Math.round(s.us_aqi)}
              </span>
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className="w-3/5 rounded-t-md transition-all"
                  style={{
                    height: s.us_aqi === null ? 4 : Math.max(8, (s.us_aqi / maxAqi) * 40),
                    background: `linear-gradient(180deg, ${FORECAST_RISK_COLORS[s.risk]}, ${FORECAST_RISK_COLORS[s.risk]}33)`,
                    boxShadow: `0 0 12px ${FORECAST_RISK_COLORS[s.risk]}55`,
                  }}
                />
              </div>
              <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}