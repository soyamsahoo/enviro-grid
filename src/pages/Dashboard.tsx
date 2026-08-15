import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  Check,
  Database,
  Download,
  Flame,
  Leaf,
  Loader2,
  MoreHorizontal,
  Radar,
  Route,
  Satellite,
  Zap,
} from "lucide-react";
import type { PersonaId } from "@/lib/ai/personas";
import { computeRoutes, type RouteMode } from "@/lib/exposure";
import type { AggregatePayload, AlertRule, SearchLocation } from "@/lib/types";
import { generatePersonaScore } from "@/lib/ai/copilot";
import { aggregateEnvironment, recordSearch } from "@/lib/services/apiAggregator";
import { fetchAqiGrid } from "@/lib/services/openaq";
import { avgPm25AlongRoute, fetchRoute, type LatLng, type RouteResult } from "@/lib/routing";
import { isSupabaseConfigured, checkSupabaseTables } from "@/lib/services/supabase";
import { reverseGeocode } from "@/components/dashboard/LocationSearch";
import { cn, timeAgo } from "@/lib/utils";
import { exportSnapshot } from "@/lib/export";
import LocationSearch from "@/components/dashboard/LocationSearch";
import BreadcrumbNav from "@/components/dashboard/BreadcrumbNav";
import PersonaSelector from "@/components/dashboard/PersonaSelector";
import RadarMap from "@/components/map/RadarMap";
import ExposureCard from "@/components/score/ExposureCard";
import RouteDrawer from "@/components/routes/RouteDrawer";
import VerifiedWhyCard from "@/components/dashboard/VerifiedWhyCard";
import MetricsGrid from "@/components/dashboard/MetricsGrid";
import BiodiversityCarousel from "@/components/dashboard/BiodiversityCarousel";
import TrendChart from "@/components/dashboard/TrendChart";
import ForecastCards from "@/components/dashboard/ForecastCards";
import BioAnalytics from "@/components/dashboard/BioAnalytics";
import DeltaBadges from "@/components/dashboard/DeltaBadges";
import CopilotChat from "@/components/chat/CopilotChat";
import AlertsModal, { evaluateAlerts } from "@/components/alerts/AlertsModal";

const DEFAULT_LOCATION: SearchLocation = {
  lat: 28.6139,
  lon: 77.209,
  name: "New Delhi, Delhi, India",
};

export default function Dashboard() {
  const [location, setLocation] = useState<SearchLocation>(DEFAULT_LOCATION);
  const [persona, setPersona] = useState<PersonaId>("general_citizen");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>("fastest");

  const [supabaseInfo, setSupabaseInfo] = useState<{
    configured: boolean;
    ready: boolean;
    missingTables: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured()) {
      setSupabaseInfo({ configured: false, ready: false, missingTables: [] });
      return;
    }
    checkSupabaseTables().then((r) => {
      if (!cancelled) setSupabaseInfo({ configured: true, ...r });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const envQuery = useQuery({
    queryKey: ["environment", location.lat.toFixed(4), location.lon.toFixed(4)],
    queryFn: () =>
      aggregateEnvironment({
        lat: location.lat,
        lon: location.lon,
        name: location.name,
      }),
    staleTime: 15 * 60 * 1000,
  });

  const payload = envQuery.data?.payload ?? null;

  const copilotQuery = useQuery({
    queryKey: ["copilot", persona, envQuery.data?.payload?.fetched_at],
    queryFn: async () => {
      if (!payload) throw new Error("no payload");
      const result = await generatePersonaScore(payload, persona);
      void recordSearch(
        location.lat,
        location.lon,
        persona,
        location.name,
        result.score.persona_health_score,
      );
      return result;
    },
    enabled: Boolean(payload),
  });

  // --------------------------------------------------- live route + AQI grid
  const gridQuery = useQuery({
    queryKey: ["aqiGrid", location.lat.toFixed(4), location.lon.toFixed(4)],
    queryFn: () => fetchAqiGrid(location.lat, location.lon),
    staleTime: 10 * 60 * 1000,
  });

  // Default demo corridor: New Delhi → Noida (one of India's most
  // polluted commutes) so the inhaled-dose demo opens with real numbers.
  const [origin, setOrigin] = useState<LatLng>(() => ({
    lat: 28.6139,
    lon: 77.209,
  }));
  const [destination, setDestination] = useState<LatLng>(() => ({
    lat: 28.5355,
    lon: 77.391,
  }));

  // Reset pins when the user searches a new place.
  useEffect(() => {
    setOrigin({ lat: location.lat, lon: location.lon - 0.012 });
    setDestination({ lat: location.lat + 0.006, lon: location.lon + 0.012 });
  }, [location.lat, location.lon]);

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Debounced reroute: dragging a pin (or new grid data) re-integrates the
  // edge-weight toxicity formula on the fly.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setRouteLoading(true);
      try {
        const res = await fetchRoute(origin, destination);
        if (cancelled) return;
        const avgPm25 = avgPm25AlongRoute(res.coords, gridQuery.data ?? []);
        setRoute({ ...res, avgPm25 });
      } catch {
        if (!cancelled) setRoute((r) => (r ? { ...r, avgPm25: null } : null));
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [origin, destination, gridQuery.data]);

  const useCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocError("Geolocation isn't supported by this browser — search for a city instead.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const base = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: "My location",
        } as SearchLocation;
        const geo = await reverseGeocode(base.lat, base.lon).catch(() => null);
        const g = geo as Partial<SearchLocation> | null;
        setLocation(
          g && (g.country || g.city || g.locality)
            ? {
                ...base,
                name: [g.city, g.admin1, g.country].filter(Boolean).join(", ") || base.name,
                country: g.country,
                admin1: g.admin1,
                city: g.city,
                locality: g.locality,
              }
            : base,
        );
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied — allow it in your browser address bar, then retry."
            : err.code === err.TIMEOUT
              ? "Location lookup timed out — retry, or search for a city instead."
              : "Couldn't determine your position — retry, or search for a city instead.",
        );
      },
      // Fast, reliable fix: low accuracy + cached fixes beat a 10s high-accuracy hunt.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  const loading = envQuery.isLoading;
  const isDemo =
    !isSupabaseConfigured() ||
    !import.meta.env.VITE_OPENAQ_API_KEY ||
    !import.meta.env.VITE_NASA_FIRMS_MAP_KEY ||
    !import.meta.env.VITE_LLM_API_KEY;

  const missingKeys = useMemo(() => {
    const missing: string[] = [];
    if (!import.meta.env.VITE_OPENAQ_API_KEY) missing.push("OPENAQ_API_KEY");
    if (!import.meta.env.VITE_NASA_FIRMS_MAP_KEY) missing.push("NASA_FIRMS_MAP_KEY");
    if (!import.meta.env.VITE_LLM_API_KEY) missing.push("LLM_API_KEY");
    if (!isSupabaseConfigured()) missing.push("SUPABASE");
    return missing;
  }, []);

  // ------------------------------------------------------------- alerts
  const [alertRules, setAlertRules] = useState<AlertRule[]>(() => {
    try {
      const raw = localStorage.getItem("envirogrid.alert_rules.v1");
      return raw ? (JSON.parse(raw) as AlertRule[]) : [];
    } catch {
      return [];
    }
  });

  const triggeredAlerts = useMemo(
    () => (payload ? evaluateAlerts(alertRules, payload).filter((s) => s.triggered) : []),
    [alertRules, payload],
  );

  // Route dose context shared with the AI copilot: live map route + the
  // same dual-route cigarette-equivalent model shown in the drawer.
  const routeComparison = useMemo(
    () =>
      computeRoutes(payload, persona, 15, {
        activityId: "walker",
        streetPm25: route?.avgPm25 ?? undefined,
        minutesA: route ? Math.max(1, Math.round(route.durationMin)) : 15,
        mode: routeMode,
      }),
    [payload, persona, route, routeMode],
  );

  const chatContext = useMemo(() => {
    if (!routeComparison && !route && triggeredAlerts.length === 0) return undefined;
    return {
      routes: routeComparison
        ? {
            ventilationLabel: routeComparison.ventilation.label,
            activityMinutes: routeComparison.activityMinutes,
            mode: routeMode,
            routeA: { ...routeComparison.routeA },
            routeB: { ...routeComparison.routeB },
            routeD: routeComparison.routeD ? { ...routeComparison.routeD } : null,
            exposureReductionPct: routeComparison.exposureReductionPct,
            extraMinutes: routeComparison.extraMinutes,
            cleanFactor: routeComparison.cleanFactor,
            dangerFactor: routeComparison.dangerFactor,
          }
        : null,
      routeMeta: route
        ? {
            distanceKm: Math.round(route.distanceKm * 10) / 10,
            durationMin: Math.round(route.durationMin),
            avgPm25: route.avgPm25,
            from: origin,
            to: destination,
          }
        : null,
      alerts: triggeredAlerts.map(
        (a) =>
          `${a.metric} ${a.direction} ${a.threshold}: current value ${a.value}`,
      ),
    };
  }, [routeComparison, route, triggeredAlerts, routeMode, origin, destination]);

  useEffect(() => {
    localStorage.setItem("envirogrid.alert_rules.v1", JSON.stringify(alertRules));
  }, [alertRules]);

  const hierarchy = useMemo<AggregatePayload["location"] & { country?: string; admin1?: string; city?: string; locality?: string }>(() => {
    const loc = location as SearchLocation;
    return {
      lat: loc.lat,
      lon: loc.lon,
      name: loc.name,
      country: loc.country,
      admin1: loc.admin1,
      city: loc.city,
      locality: loc.locality,
    };
  }, [location]);

  const handleBreadcrumbSelect = useCallback(
    (loc: { lat: number; lon: number; name: string; admin1?: string; country?: string; city?: string }) => {
      setLocation({ ...loc, locality: undefined });
    },
    [],
  );

  const handleExport = (format: "json" | "csv" | "pdf") => {
    if (!payload) return;
    const name = location.name || "location";
    exportSnapshot(payload, name, format, {
      persona,
      routes: routeComparison
        ? {
            ventilationLabel: routeComparison.ventilation.label,
            activityMinutes: routeComparison.activityMinutes,
            mode: routeMode,
            routeA: { ...routeComparison.routeA },
            routeB: { ...routeComparison.routeB },
            routeD: routeComparison.routeD ? { ...routeComparison.routeD } : null,
            exposureReductionPct: routeComparison.exposureReductionPct,
            extraMinutes: routeComparison.extraMinutes,
          }
        : null,
      routeMeta: route
        ? { distanceKm: route.distanceKm, durationMin: route.durationMin, avgPm25: route.avgPm25 }
        : null,
      alerts: triggeredAlerts.map((a) => `${a.metric} ${a.direction} ${a.threshold}: current value ${a.value}`),
    });
  };

  return (
    <div className="min-h-full">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-40 border-b border-grid-border bg-grid-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 neo-glow-emerald">
              <Radar className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight text-slate-50">
                ENVIRO<span className="text-emerald-400">GRID</span>
                <span className="ml-1 font-mono text-[10px] text-cyan-400">v2.0</span>
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
                Environmental Intelligence
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LocationSearch
              onSelect={(loc) => {
                setLocError(null);
                setLocation(loc);
              }}
              onUseCurrent={useCurrentLocation}
              current={location}
              locating={locating}
              locError={locError}
            />
            <button
              onClick={() => setRoutesOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
              title="Compare routes by inhaled dose"
            >
              <Route className="h-4 w-4" />
              <span className="hidden sm:inline">Routes</span>
            </button>
            <button
              onClick={() => setAlertsOpen(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-grid-border bg-grid-panel2 text-slate-400 transition-colors hover:text-emerald-300"
              title="Alert rules"
            >
              <Bell className="h-4 w-4" />
              {triggeredAlerts.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white">
                  {triggeredAlerts.length}
                </span>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-grid-border bg-grid-panel2 px-3 text-slate-400 transition-colors hover:text-emerald-300"
                title="Route modes"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden text-xs sm:inline">More</span>
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-grid-border bg-grid-panel shadow-2xl">
                    <div className="px-3 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      Route mode
                    </div>
                    {(
                      [
                        {
                          mode: "fastest" as RouteMode,
                          label: "Fastest route",
                          desc: "Shortest time · street PM2.5",
                          icon: <Zap className="h-3.5 w-3.5" />,
                        },
                        {
                          mode: "cleanest" as RouteMode,
                          label: "Cleanest route",
                          desc: "Least inhaled dose · green corridor",
                          icon: <Leaf className="h-3.5 w-3.5" />,
                        },
                        {
                          mode: "dangerous" as RouteMode,
                          label: "Dangerous route",
                          desc: "Hotspot corridor · worst exposure",
                          icon: <Flame className="h-3.5 w-3.5" />,
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.mode}
                        onClick={() => {
                          setRouteMode(item.mode);
                          setMoreOpen(false);
                          setRoutesOpen(true);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary",
                          routeMode === item.mode ? "bg-emerald-500/10" : "",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                            item.mode === "fastest"
                              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                              : item.mode === "cleanest"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                : "border-red-500/40 bg-red-500/10 text-red-300",
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-100">
                            {item.label}
                            {routeMode === item.mode && (
                              <Check className="h-3 w-3 text-emerald-400" />
                            )}
                          </span>
                          <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
                            {item.desc}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-grid-border bg-grid-panel2 px-3 text-slate-400 transition-colors hover:text-emerald-300"
                title="Export snapshot"
              >
                <Download className="h-4 w-4" />
                <span className="hidden text-xs sm:inline">Export</span>
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-grid-border bg-grid-panel shadow-xl">
                    <div className="px-3 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      Snapshot · {location.name?.split(",")[0] ?? "location"}
                    </div>
                    {(["json", "csv", "pdf"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          handleExport(f);
                          setExportOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-300 transition-colors hover:bg-secondary hover:text-emerald-300"
                      >
                        <span>{f === "json" ? "JSON" : f === "csv" ? "CSV" : "PDF"}</span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
                          {f === "json" ? "full report" : f === "csv" ? "spreadsheet" : "report"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <BreadcrumbNav
              hierarchy={hierarchy}
              onSelect={handleBreadcrumbSelect}
              onReset={() => setLocation(DEFAULT_LOCATION)}
            />
          </div>
          <PersonaSelector value={persona} onChange={setPersona} />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                Syncing feeds…
              </span>
            ) : (
              payload && (
                <span className="flex items-center gap-1.5">
                  <Satellite className="h-3.5 w-3.5 text-cyan-400" />
                  Live data · {timeAgo(payload.fetched_at)}
                  {envQuery.data?.fromCache && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
                      cached
                    </span>
                  )}
                </span>
              )
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        {isDemo && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200">
            <BrainCircuit className="h-4 w-4 shrink-0" />
            Demo mode — missing keys:{" "}
            <span className="font-mono">{missingKeys.join(", ") || "none"}</span>. OpenAQ /
            NASA FIRMS / AI will be skipped or use the local fallback model. See{" "}
            <code className="font-mono text-amber-300">.env.example</code>.
          </div>
        )}

        {supabaseInfo?.configured && !supabaseInfo.ready && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-xs text-red-300">
            <Database className="h-4 w-4 shrink-0" />
            Supabase tables not found
            {supabaseInfo.missingTables.length > 0 && (
              <>
                : <span className="font-mono">{supabaseInfo.missingTables.join(", ")}</span>
              </>
            )}
            . Run{" "}
            <code className="font-mono text-red-200">
              supabase/migrations/20260813000000_init.sql
            </code>{" "}
            in the Supabase SQL editor. Cache is disabled until then.
          </div>
        )}

        {/* ------------------------------------------------- hero + why */}
        <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <ExposureCard
            pm25={payload?.air_quality.pm25 ?? null}
            persona={persona}
            score={copilotQuery.data?.score.persona_health_score ?? null}
            riskLevel={copilotQuery.data?.score.risk_level}
            loading={loading || copilotQuery.isLoading}
          />

          <div className="flex flex-col gap-4">
            <VerifiedWhyCard
              score={copilotQuery.data?.score ?? null}
              fromLLM={Boolean(copilotQuery.data?.fromLLM)}
            />
            <MetricsGrid payload={payload ?? emptyPayload()} />
          </div>
        </section>

      <section>
          <ForecastCards payload={payload ?? emptyPayload()} />
        </section>

        {/* -------------------------------------------------------- map */}
        <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <RadarMap
              payload={payload}
              center={{ lat: location.lat, lon: location.lon }}
              className="h-[520px]"
              grid={gridQuery.data ?? []}
              origin={origin}
              destination={destination}
              onOriginChange={setOrigin}
              onDestinationChange={setDestination}
              routeCoords={route?.coords}
              routeMeta={route}
              routeLoading={routeLoading}
              routeMode={routeMode}
              onOpenRoutes={() => setRoutesOpen(true)}
            />
            <DeltaBadges payload={payload ?? emptyPayload()} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <TrendChart payload={payload ?? emptyPayload()} />
            <div className="glass flex-1 rounded-xl p-5">
              <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                <Database className="h-3.5 w-3.5" /> Data pipeline
              </div>
              <ul className="space-y-2.5 text-xs text-slate-400">
                {[
                  ["OpenAQ", "PM2.5 · PM10 · NO₂ · AQI", "bg-emerald-400"],
                  ["Open-Meteo", "Temp · humidity · wind · UV · rain · 3h AQI forecast", "bg-cyan-400"],
                  ["NASA FIRMS", "Active fire hotspots (100 km)", "bg-red-400"],
                  ["GBIF", "Biodiversity occurrences (15 km)", "bg-green-400"],
                  ["Wikipedia", "Common names + species images", "bg-amber-400"],
                ].map(([src, desc, dot]) => (
                  <li key={src} className="flex items-start gap-2">
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                    <span>
                      <span className="font-medium text-slate-200">{src}</span> — {desc}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-grid-border pt-3">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md border border-grid-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    15-min cache · PostGIS-backed
                  </span>
                  {triggeredAlerts.length > 0 && (
                    <span className="flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-red-400">
                      <AlertTriangle className="h-3 w-3" /> {triggeredAlerts.length} alert
                      {triggeredAlerts.length > 1 ? "s" : ""} active
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ biodiversity */}
        <section className="space-y-4">
          <BioAnalytics payload={payload ?? emptyPayload()} />
          {envQuery.isLoading ? (
            <div className="glass flex h-40 items-center justify-center rounded-xl text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching local species…
            </div>
          ) : envQuery.isError ? (
            <div className="glass flex h-40 flex-col items-center justify-center gap-1 rounded-xl text-sm text-slate-500">
              <Leaf className="h-6 w-6 text-slate-600" />
              No recent species cataloged for this area.
              <span className="text-xs text-slate-600">
                The biodiversity feed is unavailable right now.
              </span>
            </div>
          ) : payload ? (
            <BiodiversityCarousel payload={payload} />
          ) : null}
        </section>
      </main>

      <footer className="border-t border-grid-border py-4 text-center font-mono text-[10px] uppercase tracking-widest text-slate-600">
        ENVIROGRID 2.0 · multi-source environmental intelligence · data: OpenAQ, Open-Meteo,
        NASA FIRMS, GBIF, Wikipedia
      </footer>

      {alertsOpen && (
        <AlertsModal
          payload={payload}
          rules={alertRules}
          onRulesChange={setAlertRules}
          onClose={() => setAlertsOpen(false)}
        />
      )}
      <RouteDrawer
        payload={payload}
        persona={persona}
        open={routesOpen}
        onClose={() => setRoutesOpen(false)}
        routeMeta={route}
        routeLoading={routeLoading}
        mode={routeMode}
      />
      <CopilotChat payload={payload} persona={persona} context={chatContext} />
    </div>
  );
}

function emptyPayload(): AggregatePayload {
  return {
    location: { lat: 0, lon: 0, name: "" },
    fetched_at: new Date().toISOString(),
    air_quality: {
      pm25: null,
      pm10: null,
      no2: null,
      o3: null,
      aqi: null,
      aqi_category: "No data",
      source: "openaq",
      stations: 0,
    },
    microclimate: {
      temperature_2m: null,
      relative_humidity_2m: null,
      wind_speed_10m: null,
      uv_index: null,
      precipitation_probability: null,
      apparent_temperature: null,
      weather_code: null,
      source: "openmeteo",
    },
    fire_hotspots: [],
    biodiversity: [],
    total_occurrences: 0,
    aqi_forecast: [],
    history: { aqi_yesterday_avg: null, temp_avg_30d: null, humidity_avg_30d: null },
    taxonomy: { groups: [], indicators: { present: false, bees: 0, butterflies: 0, amphibians: 0, total_sensitive: 0 } },
  };
}