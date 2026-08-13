import {
  Wind,
  Sun,
  Droplets,
  Thermometer,
  Flame,
  Activity,
} from "lucide-react";
import type { AggregatePayload } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { aqiColor } from "@/lib/services/openaq";
import { cn, formatNumber } from "@/lib/utils";

const codeText: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow",
  75: "Heavy snow", 80: "Light showers", 81: "Showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Storm + hail", 99: "Severe storm + hail",
};

export default function MetricsGrid({ payload }: { payload: AggregatePayload }) {
  const aq = payload.air_quality;
  const mc = payload.microclimate;
  const fires = payload.fire_hotspots.length;
  const color = aqiColor(aq.aqi);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        icon={<Activity className="h-4 w-4" />}
        label="Air Quality Index"
        value={formatNumber(aq.aqi)}
        sub={aq.aqi_category}
        accent={color}
        badge={aq.stations > 0 ? `${aq.stations} stations` : undefined}
      />
      <MetricCard
        icon={<Thermometer className="h-4 w-4" />}
        label="Temperature"
        value={mc.temperature_2m === null ? "—" : `${formatNumber(mc.temperature_2m, 1)}°C`}
        sub={mc.apparent_temperature === null ? undefined : `feels ${formatNumber(mc.apparent_temperature, 1)}°C`}
        accent="#F59E0B"
      />
      <MetricCard
        icon={<Droplets className="h-4 w-4" />}
        label="Humidity"
        value={mc.relative_humidity_2m === null ? "—" : `${formatNumber(mc.relative_humidity_2m)}%`}
        sub={weatherText(mc.weather_code)}
        accent="#22D3EE"
      />
      <MetricCard
        icon={<Sun className="h-4 w-4" />}
        label="UV Index"
        value={mc.uv_index === null ? "—" : formatNumber(mc.uv_index, 1)}
        sub={uvText(mc.uv_index)}
        accent="#F97316"
      />
      <MetricCard
        icon={<Wind className="h-4 w-4" />}
        label="Wind Speed"
        value={mc.wind_speed_10m === null ? "—" : `${formatNumber(mc.wind_speed_10m, 1)} km/h`}
        sub={mc.precipitation_probability === null ? undefined : `☔ ${formatNumber(mc.precipitation_probability)}% rain`}
        accent="#34D399"
      />
      <MetricCard
        icon={<Flame className="h-4 w-4" />}
        label="Active Fires"
        value={String(fires)}
        sub={fires === 0 ? "clear within 25 km" : "within 25 km radius"}
        accent={fires === 0 ? "#10B981" : "#EF4444"}
        badge={fires > 0 ? "ALERT" : undefined}
        pulse={fires > 0}
      />
    </div>
  );
}

function weatherText(code: number | null): string | undefined {
  if (code === null) return undefined;
  return codeText[code] ?? `WMO code ${code}`;
}

function uvText(uv: number | null): string | undefined {
  if (uv === null) return undefined;
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
  badge,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  badge?: string;
  pulse?: boolean;
}) {
  return (
    <Card className="overflow-hidden transition-colors hover:border-slate-600">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            <span style={{ color: accent }}>{icon}</span>
            {label}
          </span>
          {badge && (
            <Badge variant={pulse ? "destructive" : "cyan"} className={cn(pulse && "animate-pulse")}>
              {badge}
            </Badge>
          )}
        </div>
        <div className="mt-2.5 font-display text-2xl font-semibold tabular-nums text-slate-50">
          {value}
        </div>
        {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export { codeText };
