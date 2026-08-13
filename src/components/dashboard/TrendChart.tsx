import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  type TooltipProps,
} from "recharts";
import type { AggregatePayload } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fmtHour = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });

function GlassTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-grid-border bg-[#0E1420]/95 px-3 py-2 shadow-2xl backdrop-blur">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        {label}
      </div>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div key={String(entry.name)} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: entry.color ?? entry.stroke }}
            />
            <span className="text-slate-400">{entry.name}:</span>
            <span className="font-semibold tabular-nums" style={{ color: entry.color ?? entry.stroke }}>
              {typeof entry.value === "number" ? entry.value.toFixed(1) : "n/a"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrendChart({ payload }: { payload: AggregatePayload }) {
  const data = useMemo(() => {
    const h = payload.microclimate.hourly;
    if (!h || h.time.length === 0) return [];
    return h.time.slice(0, 24).map((time, i) => ({
      time: fmtHour(time),
      temp: h.temperature_2m?.[i],
      uv: h.uv_index?.[i],
      rain: h.precipitation_probability?.[i],
    }));
  }, [payload]);

  if (data.length === 0) return null;

  return (
    <Card className="relative overflow-hidden border-grid-border neo-glow-emerald">
      {/* Kokonut-style ambient gradient mesh */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />

      <CardHeader className="relative pb-2">
        <CardTitle className="text-sm text-slate-200">
          24h Trendline{" "}
          <span className="ml-1 font-mono text-[10px] font-normal uppercase tracking-widest text-slate-500">
            Open-Meteo hourly
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradRain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#64748B", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#1E293B" }}
              interval={3}
            />
            <YAxis
              tick={{ fill: "#64748B", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip content={<GlassTooltip />} cursor={{ stroke: "#334155", strokeDasharray: "3 3" }} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#64748B" }} />
            <Area
              type="monotone"
              dataKey="temp"
              name="Temp °C"
              stroke="#22D3EE"
              strokeWidth={2.5}
              fill="url(#gradTemp)"
              dot={false}
              activeDot={{ r: 4, fill: "#22D3EE", stroke: "#0E1420", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="uv"
              name="UV"
              stroke="#F59E0B"
              strokeWidth={2}
              fill="url(#gradUv)"
              dot={false}
              activeDot={{ r: 4, fill: "#F59E0B", stroke: "#0E1420", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="rain"
              name="Rain %"
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="4 3"
              fill="url(#gradRain)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}