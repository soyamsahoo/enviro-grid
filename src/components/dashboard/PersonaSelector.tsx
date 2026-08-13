import { cn } from "@/lib/utils";
import type { PersonaId } from "@/lib/ai/personas";
import { PERSONA_PROFILES, PERSONA_IDS } from "@/lib/ai/personas";

export default function PersonaSelector({
  value,
  onChange,
}: {
  value: PersonaId;
  onChange: (p: PersonaId) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        Profile
      </span>
      {PERSONA_IDS.map((id) => {
        const profile = PERSONA_PROFILES[id];
        const active = id === value;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={profile.description}
            className={cn(
              "group relative rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
              active
                ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 neo-glow-emerald"
                : "border-grid-border bg-grid-panel/60 text-slate-400 hover:border-slate-600 hover:text-slate-200",
            )}
          >
            {profile.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
