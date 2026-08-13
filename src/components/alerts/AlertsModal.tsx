import { useEffect, useMemo } from "react";
import { AlertTriangle, Bell, Plus, Save, Trash2, X } from "lucide-react";
import type { AggregatePayload, AlertMetricKey, AlertRule, AlertState } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALERT_METRICS: Array<{ key: AlertMetricKey; label: string; unit: string; max: number; step: number; health: boolean }> = [
  { key: "aqi", label: "US AQI", unit: "index", max: 300, step: 1, health: true },
  { key: "pm25", label: "PM2.5", unit: "µg/m³", max: 200, step: 1, health: true },
  { key: "pm10", label: "PM10", unit: "µg/m³", max: 300, step: 1, health: true },
  { key: "uv", label: "UV Index", unit: "", max: 12, step: 0.5, health: true },
  { key: "temperature", label: "Temperature", unit: "°C", max: 50, step: 1, health: false },
  { key: "humidity", label: "Humidity", unit: "%", max: 100, step: 1, health: false },
  { key: "rain", label: "Rain probability", unit: "%", max: 100, step: 1, health: false },
  { key: "fire_count", label: "Active fires", unit: "in 100 km", max: 500, step: 1, health: false },
];

const STORAGE_KEY = "envirogrid.alert_rules.v1";

export function evaluateAlerts(rules: AlertRule[], payload: AggregatePayload): AlertState[] {
  const metricValue = (m: AlertMetricKey): number | null => {
    switch (m) {
      case "aqi":
        return payload.air_quality.aqi;
      case "pm25":
        return payload.air_quality.pm25;
      case "pm10":
        return payload.air_quality.pm10;
      case "uv":
        return payload.microclimate.uv_index ?? null;
      case "temperature":
        return payload.microclimate.temperature_2m;
      case "humidity":
        return payload.microclimate.relative_humidity_2m;
      case "rain":
        return payload.microclimate.precipitation_probability ?? null;
      case "fire_count":
        return payload.fire_hotspots.length;
    }
  };
  return rules
    .filter((r) => r.enabled)
    .map((r) => {
      const value = metricValue(r.metric);
      const triggered = value !== null && (r.direction === "above" ? value >= r.threshold : value <= r.threshold);
      return { ...r, value, triggered };
    });
}

export default function AlertsModal({
  payload,
  rules,
  onRulesChange,
  onClose,
}: {
  payload: AggregatePayload | null;
  rules: AlertRule[];
  onRulesChange: (rules: AlertRule[]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  const states = useMemo(() => evaluateAlerts(rules, payload ?? ({} as AggregatePayload)), [rules, payload]);

  const addRule = () => {
    const metric = ALERT_METRICS[0].key;
    onRulesChange([
      ...rules,
      { id: `r-${Date.now()}`, metric, threshold: ALERT_METRICS[0].max / 2, direction: "above", enabled: true, createdAt: new Date().toISOString() },
    ]);
  };

  const update = (id: string, patch: Partial<AlertRule>) =>
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="scrollbar-thin max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-grid-border bg-grid-panel/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-slate-100">Alert Rules</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-secondary hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {rules.map((r) => {
            const metric = ALERT_METRICS.find((m) => m.key === r.metric)!;
            const state = states.find((s) => s.id === r.id);
            return (
              <div key={r.id} className="rounded-xl border border-grid-border bg-grid-panel2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={r.metric}
                    onChange={(e) => update(r.id, { metric: e.target.value as AlertMetricKey })}
                    className="rounded-lg border border-grid-border bg-grid-panel px-2 py-1.5 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                  >
                    {ALERT_METRICS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.direction}
                    onChange={(e) => update(r.id, { direction: e.target.value as AlertRule["direction"] })}
                    className="rounded-lg border border-grid-border bg-grid-panel px-2 py-1.5 text-sm text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="above">≥</option>
                    <option value="below">≤</option>
                  </select>
                  <input
                    type="number"
                    value={r.threshold}
                    min={0}
                    max={metric.max}
                    step={metric.step}
                    onChange={(e) => update(r.id, { threshold: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-grid-border bg-grid-panel px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500/50 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">{metric.unit}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => update(r.id, { enabled: !r.enabled })}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        r.enabled ? "bg-emerald-500/60" : "bg-slate-700",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                          r.enabled ? "left-[18px]" : "left-0.5",
                        )}
                      />
                    </button>
                    <button
                      onClick={() => onRulesChange(rules.filter((x) => x.id !== r.id))}
                      className="rounded-md p-1 text-slate-600 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {state?.value !== null && state && (
                  <div className="mt-2 flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-slate-500">
                      Now: <span className="text-slate-300">{state.value}</span>
                    </span>
                    {state.triggered && (
                      <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-red-400">
                        <AlertTriangle className="h-3 w-3" /> TRIGGERED
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={addRule}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-grid-border px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
        >
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>

        <div className="mt-4 flex items-center justify-between border-t border-grid-border pt-3">
          <span className="text-[11px] text-slate-600">Rules persist on this device. Triggered states appear on the dashboard bell.</span>
          <button onClick={onClose} className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30">
            <Save className="h-4 w-4" /> Done
          </button>
        </div>
      </div>
    </div>
  );
}