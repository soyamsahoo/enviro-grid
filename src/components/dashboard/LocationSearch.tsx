import { useMemo, useState } from "react";
import { Search, LocateFixed, Loader2, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/services/http";
import type { SearchLocation } from "@/lib/types";

interface GeoResult {
  name?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  admin1?: string;
}

const GEO_URL =
  "https://geocoding-api.open-meteo.com/v1/search?name={q}&count=6&language=en&format=json";

interface ReverseGeo {
  countryName?: string;
  principalSubdivision?: string;
  city?: string;
  locality?: string;
  neighbourhood?: string;
}

/**
 * Reverse geocodes coordinates via BigDataCloud (keyless, CORS-enabled)
 * to fill the admin hierarchy for the breadcrumb navigation.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<Partial<SearchLocation>> {
  try {
    const data = await fetchJson<ReverseGeo>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}` +
        `&longitude=${lon}&localityLanguage=en`,
    );
    return {
      country: data.countryName,
      admin1: data.principalSubdivision,
      city: data.city,
      locality: data.locality,
      neighbourhood: data.neighbourhood,
    };
  } catch {
    return {};
  }
}

export default function LocationSearch({
  onSelect,
  onUseCurrent,
  current,
  locating,
}: {
  onSelect: (loc: SearchLocation) => void;
  onUseCurrent: () => void;
  current: SearchLocation | null;
  locating: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchLocation[]>([]);
  const [searching, setSearching] = useState(false);

  const debounced = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (q: string) => {
      clearTimeout(timer);
      if (q.trim().length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      timer = setTimeout(() => {
        setSearching(true);
        fetchJson<{ results?: GeoResult[] }>(GEO_URL.replace("{q}", encodeURIComponent(q)))
          .then((data) => {
            const mapped = (data.results ?? [])
              .filter((r) => r.latitude !== undefined && r.longitude !== undefined)
              .map((r) => ({
                lat: r.latitude!,
                lon: r.longitude!,
                name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
                country: r.country,
                admin1: r.admin1,
                city: r.name,
              }));
            setResults(mapped);
            setOpen(true);
          })
          .catch(() => setResults([]))
          .finally(() => setSearching(false));
      }, 350);
    };
  }, []);

  return (
    <div className="relative w-full max-w-md">
      <div className="flex items-center gap-2 rounded-xl border border-grid-border bg-grid-panel/80 p-1.5 backdrop-blur">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              debounced(e.target.value);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Search city, region…"
            className="w-full rounded-lg bg-transparent py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-400" />
          )}
        </div>
        <button
          onClick={onUseCurrent}
          disabled={locating}
          title="Use current location (GPS)"
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Use my location</span>
        </button>
      </div>

      {current && (
        <div className="mt-1.5 flex items-center gap-1.5 px-2 font-mono text-[11px] text-cyan-300/90">
          <Navigation className="h-3 w-3" />
          {current.name} · {current.lat.toFixed(3)}, {current.lon.toFixed(3)}
        </div>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-grid-border bg-grid-panel/95 shadow-2xl backdrop-blur">
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lon}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setQuery(r.name);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300",
                i > 0 && "border-t border-grid-border/60",
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}