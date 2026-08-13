import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Loader2, MapPin, Navigation, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/services/http";
import type { LatLng } from "@/lib/routing";

interface GeoHit {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

const GEO_URL =
  "https://geocoding-api.open-meteo.com/v1/search?name={q}&count=6&language=en&format=json";

function coordLabel(p: LatLng): string {
  return `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
}

function hitLabel(h: GeoHit): string {
  const region = [h.admin1, h.country].filter(Boolean).join(", ");
  return region ? `${h.name}, ${region}` : h.name;
}

/**
 * From/To route form with geocoded autocomplete. On submit it hands new
 * coordinates to the parent, which re-fetches the OSRM route and re-integrates
 * the inhaled-dose formula live. Dragging the map pins updates the inputs.
 */
export default function RouteForm({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
}: {
  origin: LatLng;
  destination: LatLng;
  onOriginChange: (p: LatLng) => void;
  onDestinationChange: (p: LatLng) => void;
}) {
  const [fromText, setFromText] = useState(coordLabel(origin));
  const [toText, setToText] = useState(coordLabel(destination));
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [searching, setSearching] = useState(false);
  const emittedFrom = useRef(false);
  const emittedTo = useRef(false);

  // Reflect external coordinate changes (pin drags / location swap) in the
  // inputs — unless the current text was just emitted by our own selection.
  useEffect(() => {
    if (emittedFrom.current) {
      emittedFrom.current = false;
      return;
    }
    setFromText(coordLabel(origin));
  }, [origin.lat, origin.lon]);

  useEffect(() => {
    if (emittedTo.current) {
      emittedTo.current = false;
      return;
    }
    setToText(coordLabel(destination));
  }, [destination.lat, destination.lon]);

  const query = activeField === "from" ? fromText : toText;

  // Debounced geocoding autocomplete
  useEffect(() => {
    if (activeField === null || query.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetchJson<{ results?: GeoHit[] }>(
          GEO_URL.replace("{q}", encodeURIComponent(query.trim())),
        );
        if (!cancelled) setHits(data.results ?? []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, activeField]);

  const select = (field: "from" | "to", h: GeoHit) => {
    const p: LatLng = { lat: h.latitude, lon: h.longitude };
    const label = hitLabel(h);
    if (field === "from") {
      setFromText(label);
      emittedFrom.current = true;
      onOriginChange(p);
    } else {
      setToText(label);
      emittedTo.current = true;
      onDestinationChange(p);
    }
    setHits([]);
    setActiveField(null);
    window.setTimeout(() => {
      if (field === "from") emittedFrom.current = false;
      else emittedTo.current = false;
    }, 500);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && hits.length > 0 && activeField) {
      e.preventDefault();
      select(activeField, hits[0]);
    }
    if (e.key === "Escape") {
      setHits([]);
      setActiveField(null);
    }
  };

  const swap = () => {
    const o = { ...origin };
    const d = { ...destination };
    emittedFrom.current = true;
    emittedTo.current = true;
    setFromText(toText);
    setToText(fromText);
    onOriginChange(d);
    onDestinationChange(o);
    window.setTimeout(() => {
      emittedFrom.current = false;
      emittedTo.current = false;
    }, 500);
  };

  const field = (
    side: "from" | "to",
    value: string,
    onChange: (v: string) => void,
    icon: React.ReactNode,
    placeholder: string,
  ) => {
    const active = activeField === side;
    return (
      <div className="relative flex-1">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-grid-panel2 px-2.5 py-2 transition-colors",
            active
              ? "border-emerald-500/50 shadow-[0_0_14px_-6px_rgba(16,185,129,0.7)]"
              : "border-grid-border",
          )}
        >
          <span className={cn(side === "from" ? "text-rose-400" : "text-emerald-400")}>
            {icon}
          </span>
          <input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setActiveField(side);
            }}
            onFocus={() => setActiveField(side)}
            onBlur={() => window.setTimeout(() => setActiveField((f) => (f === side ? null : f)), 150)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent font-mono text-[11px] text-slate-100 outline-none placeholder:text-slate-600"
          />
          {searching && active && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-slate-500" />}
        </div>

        {active && hits.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-grid-border bg-grid-panel shadow-2xl">
            {hits.slice(0, 5).map((h) => (
              <button
                key={h.latitude + "," + h.longitude + h.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(side, h);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-emerald-500/10"
              >
                <Search className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-slate-100">{h.name}</span>
                  <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-slate-500">
                    {[h.admin1, h.country].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-slate-600">
                  {h.latitude.toFixed(3)}, {h.longitude.toFixed(3)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Route from → to
        </span>
        <button
          onClick={swap}
          title="Swap origin and destination"
          className="flex items-center gap-1 rounded-md border border-grid-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
        >
          <ArrowUpDown className="h-3 w-3" /> swap
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {field(
          "from",
          fromText,
          setFromText,
          <MapPin className="h-3.5 w-3.5" />,
          "Start location…",
        )}
        {field(
          "to",
          toText,
          setToText,
          <Navigation className="h-3.5 w-3.5" />,
          "Destination…",
        )}
      </div>
    </div>
  );
}