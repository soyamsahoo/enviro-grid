import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { AggregatePayload } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fmtHour = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });

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
    <Card className="neo-glow-emerald">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200">
          24h Trendline{" "}
          <span className="ml-1 font-mono text-[10px] font-normal uppercase tracking-widest text-slate-500">
            Open-Meteo hourly
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
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
            <Tooltip
              contentStyle={{
                background: "#0E1420",
                border: "1px solid #1E293B",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#94A3B8" }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#64748B" }} />
            <Line
              type="monotone"
              dataKey="temp"
              name="Temp °C"
              stroke="#22D3EE"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="uv"
              name="UV"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="rain"
              name="Rain %"
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
