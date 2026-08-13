import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Globe2, Loader2 } from "lucide-react";
import type { GeoHierarchy } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BreadcrumbLevel {
  key: string;
  label: string;
  level: number;
  status: "idle" | "loading" | "error";
}

export const HIERARCHY_KEYS: (keyof GeoHierarchy | "global")[] = [
  "global",
  "country",
  "admin1",
  "city",
  "locality",
  "neighbourhood",
];

const HIERARCHY_LABELS: Record<string, string> = {
  global: "Global Earth",
  country: "Country",
  admin1: "State / Region",
  city: "City",
  locality: "Locality",
  neighbourhood: "Neighbourhood",
};

/**
 * Builds breadcrumb levels from the active location's admin hierarchy.
 * Resolves centroid coordinates for regional levels via Open-Meteo
 * geocoding so users can jump to any administrative scope.
 */
export default function BreadcrumbNav({
  hierarchy,
  onSelect,
  onReset,
}: {
  hierarchy: GeoHierarchy;
  onSelect: (loc: { lat: number; lon: number; name: string; admin1?: string; country?: string; city?: string }) => void;
  onReset: () => void;
}) {
  const active = useMemo(() => {
    const entry = (key: string): string | null => {
      if (key === "global") return "Global Earth";
      return (hierarchy as unknown as Record<string, string | undefined>)[key] ?? null;
    };
    return HIERARCHY_KEYS.map((key) => ({ key, label: entry(key) })).filter((l) => l.label);
  }, [hierarchy]);

  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    setResolving(null);
  }, [hierarchy]);

  const jump = async (key: string, label: string) => {
    if (resolving) return;
    if (key === "global") {
      onReset();
      return;
    }
    setResolving(key);
    try {
      const loc = await resolveCentroid(key, label, hierarchy);
      if (loc) onSelect(loc);
    } catch {
      setResolving(null);
    }
  };

  if (active.length <= 1) return null;

  return (
    <nav className="scrollbar-thin flex items-center gap-1 overflow-x-auto py-1 font-mono text-[11px] uppercase tracking-wider">
      {active.map((level, i) => {
        const isLast = i === active.length - 1;
        const resolvingNow = resolving === level.key;
        return (
          <span key={level.key} className="flex shrink-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
            <button
              onClick={() => jump(level.key, level.label!)}
              disabled={isLast || resolvingNow}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors",
                isLast
                  ? "cursor-default text-emerald-300"
                  : "text-slate-500 hover:bg-grid-panel hover:text-slate-200",
              )}
              title={
                level.key === "global"
                  ? "Zoom out to global view"
                  : `Jump to ${HIERARCHY_LABELS[level.key]} level: ${level.label}`
              }
            >
              {level.key === "global" && <Globe2 className="h-3 w-3" />}
              {resolvingNow ? (
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
              ) : (
                level.label
              )}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

/** Resolves a plausible centroid for the given hierarchy level via geocoding. */
async function resolveCentroid(
  key: string,
  label: string,
  hierarchy: GeoHierarchy,
): Promise<{ lat: number; lon: number; name: string; admin1?: string; country?: string; city?: string } | null> {
  const query =
    key === "country"
      ? label
      : key === "admin1"
        ? `${hierarchy.admin1}, ${hierarchy.country ?? ""}`
        : key === "city"
          ? `${hierarchy.city}, ${hierarchy.admin1 ?? ""}, ${hierarchy.country ?? ""}`
          : label;

  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ name?: string; latitude?: number; longitude?: number; admin1?: string; country?: string }> };
  const r = data.results?.[0];
  if (!r || r.latitude === undefined || r.longitude === undefined) return null;
  return {
    lat: r.latitude,
    lon: r.longitude,
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    admin1: r.admin1,
    country: r.country,
    city: r.name,
  };
}

export { HIERARCHY_LABELS };