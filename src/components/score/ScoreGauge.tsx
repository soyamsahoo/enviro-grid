import type { RiskLevel } from "@/lib/types";

interface GaugeProps {
  score: number | null;
  riskLevel?: RiskLevel;
  loading?: boolean;
}

export function scoreColor(score: number | null): string {
  if (score === null) return "#64748B";
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  if (score >= 30) return "#F97316";
  return "#EF4444";
}

export function scoreGradient(score: number | null): string {
  if (score === null) return "#334155";
  if (score >= 75) return "url(#gradEmerald)";
  if (score >= 50) return "url(#gradAmber)";
  if (score >= 30) return "url(#gradOrange)";
  return "url(#gradRed)";
}

const RADIUS = 86;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ScoreGauge({ score, riskLevel, loading }: GaugeProps) {
  const normalized = score === null ? 0 : Math.min(100, Math.max(0, score));
  const dashOffset = CIRCUMFERENCE * (1 - normalized / 100);
  const color = scoreColor(score);

  return (
    <div className="relative mx-auto w-fit">
      <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
        <defs>
          <linearGradient id="gradEmerald" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#34D399" />
          </linearGradient>
          <linearGradient id="gradAmber" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
          <linearGradient id="gradOrange" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#FB923C" />
          </linearGradient>
          <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="100%" stopColor="#F87171" />
          </linearGradient>
        </defs>

        <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="#1E293B" strokeWidth="12" />
        <circle
          cx="110"
          cy="110"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {loading ? (
          <div className="text-4xl text-slate-600">…</div>
        ) : (
          <>
            <div className="font-display text-5xl font-bold tabular-nums" style={{ color }}>
              {score ?? "—"}
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Health Score
            </div>
            {riskLevel && (
              <span
                className="mt-2 rounded-full border px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest"
                style={{
                  color,
                  borderColor: color + "55",
                  background: color + "18",
                }}
              >
                {riskLevel} Risk
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
