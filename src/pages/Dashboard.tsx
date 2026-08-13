import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radar, Database, BrainCircuit, Loader2, Satellite } from "lucide-react";
import type { PersonaId } from "@/lib/ai/personas";
import type { AggregatePayload } from "@/lib/types";
import { PERSONA_PROFILES } from "@/lib/ai/personas";
import { generatePersonaScore } from "@/lib/ai/copilot";
import { aggregateEnvironment, recordSearch } from "@/lib/services/apiAggregator";
import { isSupabaseConfigured, checkSupabaseTables } from "@/lib/services/supabase";
import { timeAgo } from "@/lib/utils";
import type { SearchLocation } from "@/components/dashboard/LocationSearch";
import LocationSearch from "@/components/dashboard/LocationSearch";
import PersonaSelector from "@/components/dashboard/PersonaSelector";
import RadarMap from "@/components/map/RadarMap";
import ScoreGauge from "@/components/score/ScoreGauge";
import VerifiedWhyCard from "@/components/dashboard/VerifiedWhyCard";
import MetricsGrid from "@/components/dashboard/MetricsGrid";
import BiodiversityCarousel from "@/components/dashboard/BiodiversityCarousel";
import TrendChart from "@/components/dashboard/TrendChart";
import { Badge } from "@/components/ui/badge";

const DEFAULT_LOCATION: SearchLocation = {
  lat: 40.7128,
  lon: -74.006,
  name: "New York, NY, United States",
};

export default function Dashboard() {
  const [location, setLocation] = useState<SearchLocation>(DEFAULT_LOCATION);
  const [persona, setPersona] = useState<PersonaId>("general_citizen");
  const [locating, setLocating] = useState(false);

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

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: "My location",
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const profile = PERSONA_PROFILES[persona];
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

          <LocationSearch
            onSelect={setLocation}
            onUseCurrent={useCurrentLocation}
            current={location}
            locating={locating}
          />
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pb-3">
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
                :{" "}
                <span className="font-mono">{supabaseInfo.missingTables.join(", ")}</span>
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
          <div className="glass flex flex-col items-center justify-center rounded-xl p-6">
            <ScoreGauge
              score={copilotQuery.data?.score.persona_health_score ?? null}
              riskLevel={copilotQuery.data?.score.risk_level}
              loading={loading || copilotQuery.isLoading}
            />
            <div className="mt-3 text-center">
              <div className="font-display text-sm font-medium text-slate-200">
                {profile.label}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{profile.description}</div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <VerifiedWhyCard score={copilotQuery.data?.score ?? null} fromLLM={Boolean(copilotQuery.data?.fromLLM)} />
            <MetricsGrid payload={payload ?? emptyPayload()} />
          </div>
        </section>

        {/* -------------------------------------------------------- map */}
        <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <RadarMap payload={payload} center={{ lat: location.lat, lon: location.lon }} className="h-[520px]" />
          <div className="flex flex-col gap-4">
            <TrendChart payload={payload ?? emptyPayload()} />
            <div className="glass flex-1 rounded-xl p-5">
              <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                <Database className="h-3.5 w-3.5" /> Data pipeline
              </div>
              <ul className="space-y-2.5 text-xs text-slate-400">
                {[
                  ["OpenAQ", "PM2.5 · PM10 · NO₂ · AQI", "bg-emerald-400"],
                  ["Open-Meteo", "Temp · humidity · wind · UV · rain", "bg-cyan-400"],
                  ["NASA FIRMS", "Active fire hotspots (25 km)", "bg-red-400"],
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
                <Badge variant="outline" className="font-mono text-[10px]">
                  15-min cache · PostGIS-backed
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ biodiversity */}
        <section>
          {payload ? (
            <BiodiversityCarousel payload={payload} />
          ) : (
            <div className="glass flex h-40 items-center justify-center rounded-xl text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching local species…
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-grid-border py-4 text-center font-mono text-[10px] uppercase tracking-widest text-slate-600">
        ENVIROGRID 2.0 · multi-source environmental intelligence · data: OpenAQ, Open-Meteo,
        NASA FIRMS, GBIF, Wikipedia
      </footer>
    </div>
  );
}

function emptyPayload(): AggregatePayload {
  return {
    location: { lat: 0, lon: 0, name: "" },
    fetched_at: new Date().toISOString(),
    air_quality: {
      pm25: null, pm10: null, no2: null, o3: null,
      aqi: null, aqi_category: "No data", source: "openaq", stations: 0,
    },
    microclimate: {
      temperature_2m: null, relative_humidity_2m: null, wind_speed_10m: null,
      uv_index: null, precipitation_probability: null, apparent_temperature: null,
      weather_code: null, source: "openmeteo",
    },
    fire_hotspots: [],
    biodiversity: [],
    total_occurrences: 0,
  };
}
