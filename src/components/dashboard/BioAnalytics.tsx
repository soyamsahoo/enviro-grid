import { Bug, Bird, Flower2, Leaf, Sprout } from "lucide-react";
import type { AggregatePayload, TaxonGroup } from "@/lib/types";

const GROUP_ICONS: Record<string, typeof Leaf> = {
  Birds: Bird,
  Mammals: Leaf,
  Reptiles: Bird,
  Amphibians: Bug,
  Fish: Bird,
  Insects: Bug,
  Arachnids: Bug,
  Plants: Sprout,
  Fungi: Flower2,
  Other: Leaf,
};

export default function BioAnalytics({ payload }: { payload: AggregatePayload }) {
  const { groups, indicators } = payload.taxonomy ?? {
    groups: [] as TaxonGroup[],
    indicators: { present: false, bees: 0, butterflies: 0, amphibians: 0, total_sensitive: 0 },
  };

  if (!groups || groups.length === 0) return null;
  const total = groups.reduce((acc, g) => acc + g.count, 0);

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Biodiversity analytics
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
          {total} occurrences · last 30 days
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.label] ?? Leaf;
          return (
            <div
              key={g.label}
              className="flex items-center gap-2 rounded-lg border border-grid-border bg-grid-panel2 px-3 py-1.5"
            >
              <Icon className="h-3.5 w-3.5 text-emerald-400/70" />
              <span className="text-xs text-slate-300">{g.label}</span>
              <span className="rounded bg-emerald-500/15 px-1.5 font-mono text-[11px] font-semibold text-emerald-300">
                {g.count}
              </span>
            </div>
          );
        })}
      </div>

      {indicators && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-grid-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Bio-indicators
          </span>
          {[
            ["Bees", indicators.bees],
            ["Butterflies", indicators.butterflies],
            ["Amphibians", indicators.amphibians],
          ].map(([label, count]) => (
            <span
              key={label as string}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ${
                (count as number) > 0
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-secondary text-slate-600"
              }`}
            >
              {count as number > 0 ? (
                <Leaf className="h-3 w-3" />
              ) : (
                <Leaf className="h-3 w-3 opacity-40" />
              )}
              {label} × {(count as number) || 0}
            </span>
          ))}
          {indicators.total_sensitive > 0 && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] text-emerald-300">
              <Leaf className="h-3 w-3" />
              {indicators.total_sensitive} sensitive species present
            </span>
          )}
        </div>
      )}
    </div>
  );
}