import { ShieldCheck, Quote, ListChecks, TrendingUp } from "lucide-react";
import type { PersonaScore } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function VerifiedWhyCard({
  score,
  fromLLM,
}: {
  score: PersonaScore | null;
  fromLLM: boolean;
}) {
  if (!score) return null;

  return (
    <Card className="relative overflow-hidden neo-glow-cyan">
      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Verified Why
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="cyan">{score.risk_level} risk</Badge>
            {!fromLLM && (
              <Badge variant="secondary" title="No LLM key configured — deterministic local model">
                local model
              </Badge>
            )}
          </div>
        </div>
        <p className="mt-2 font-display text-xl font-semibold leading-snug text-slate-50">
          {score.headline}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Primary factor
          </div>
          <p className="text-sm font-medium text-amber-300">{score.primary_factor}</p>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            <Quote className="h-3 w-3" /> Verified analysis
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{score.verified_why}</p>
        </div>

        {score.actionable_advice.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              <ListChecks className="h-3 w-3" /> Actionable advice
            </div>
            <ul className="space-y-1.5">
              {score.actionable_advice.map((advice, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {advice}
                </li>
              ))}
            </ul>
          </div>
        )}

        {score.forecast_summary && (
          <div className="flex items-center gap-2 rounded-lg border border-grid-border bg-grid-panel2 px-3 py-2 text-xs text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            {score.forecast_summary}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
