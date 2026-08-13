import { useRef } from "react";
import { ChevronLeft, ChevronRight, Leaf } from "lucide-react";
import type { AggregatePayload } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BiodiversityCarousel({ payload }: { payload: AggregatePayload }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const species = payload.biodiversity;

  if (species.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-emerald-300">
            <Leaf className="h-4 w-4" />
            Foundation Layer — Local Biodiversity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Leaf className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">
              No recent species cataloged for this area.
            </p>
            <p className="max-w-sm text-xs text-slate-500">
              GBIF returned no occurrence records within 15 km, or the
              biodiversity feed was unavailable. Try a different location.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const scroll = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-emerald-300">
            <Leaf className="h-4 w-4" />
            Foundation Layer — Local Biodiversity
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            {species.length} species · {payload.total_occurrences.toLocaleString()} GBIF observations within 15 km
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => scroll(-1)}
            className="rounded-lg border border-grid-border p-1.5 text-slate-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll(1)}
            className="rounded-lg border border-grid-border p-1.5 text-slate-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="scrollbar-thin flex gap-3 overflow-x-auto pb-2"
        >
          {species.map((s) => (
            <div
              key={s.scientificName}
              className="group w-44 shrink-0 overflow-hidden rounded-xl border border-grid-border bg-grid-panel2 transition-colors hover:border-emerald-500/40"
            >
              <div className="h-24 w-full overflow-hidden bg-secondary/50">
                {s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt={s.commonName ?? s.scientificName}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/15 to-cyan-500/10">
                    <Leaf className="h-6 w-6 text-emerald-500/50" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-semibold text-slate-100" title={s.commonName ?? s.scientificName}>
                  {s.commonName ?? s.scientificName}
                </div>
                <div className="truncate text-xs italic text-slate-500" title={s.scientificName}>
                  {s.scientificName}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                    {s.count} sighting{s.count === 1 ? "" : "s"}
                  </span>
                  {s.imageUrl && (
                    <a
                      href={`https://en.wikipedia.org/wiki/${encodeURIComponent((s.commonName ?? s.scientificName).replace(/\s+/g, "_"))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-cyan-400/70 hover:text-cyan-300"
                    >
                      wiki ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
