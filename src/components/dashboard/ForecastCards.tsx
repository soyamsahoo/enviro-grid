import { useMemo } from "react";
import { Clock3, TrendingUp } from "lucide-react";
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

  const fmtTime = (iso: string) =>
    iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }) : "—";

  return (
    <Card className="neo-glow-cyan">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
          <TrendingUp className="h-4 w-4 text-cyan-400" />
          Forward Forecasting Engine
          <span className="ml-1 font-mono text-[10px] font-normal uppercase tracking-widest text-slate-500">
            Open-Meteo AQ model
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {slices.map((s) => (
            <div
              key={s.offsetHours}
              className="rounded-xl border border-grid-border bg-grid-panel2 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  <Clock3 className="h-3 w-3" /> {s.label}
                </span>
                <span className="font-mono text-[10px] text-slate-500">{fmtTime(s.time)}</span>
              </div>

              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className="font-display text-2xl font-semibold tabular-nums"
                  style={{ color: FORECAST_RISK_COLORS[s.risk] }}
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

              <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
                {s.temperature !== null && <span>🌡 {formatNumber(s.temperature, 1)}°C</span>}
                {s.rain_prob !== null && <span>☔ {formatNumber(s.rain_prob)}%</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
