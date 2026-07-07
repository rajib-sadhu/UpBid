import { cn } from "../../lib/utils.js";

// Latency → display tier. Offline = not in the auction room at all.
function tier(rttMs: number | null | undefined, offline: boolean) {
  if (offline) return { bars: 0, color: "text-slate-600", label: "Offline / not joined" };
  if (rttMs == null) return { bars: 3, color: "text-slate-400", label: "Connected (measuring…)" };
  if (rttMs < 150) return { bars: 3, color: "text-emerald-400", label: `Good connection (${rttMs}ms)` };
  if (rttMs < 500) return { bars: 2, color: "text-amber-400", label: `Laggy (${rttMs}ms)` };
  return { bars: 1, color: "text-red-400", label: `Very slow (${rttMs}ms)` };
}

/**
 * Network signal bars for a franchise's live-auction connection. Filled bars
 * use the tier colour; the rest stay as faint outlines so the icon reads as a
 * scale even at 1 bar.
 */
export function SignalBars({
  rttMs,
  offline,
  className,
}: {
  rttMs: number | null | undefined;
  offline: boolean;
  className?: string;
}) {
  const t = tier(rttMs, offline);
  const heights = [4, 7, 10];
  return (
    <svg
      viewBox="0 0 14 12"
      className={cn("h-3.5 w-3.5 shrink-0", t.color, className)}
      aria-label={t.label}
    >
      <title>{t.label}</title>
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * 5}
          y={12 - h}
          width={3}
          height={h}
          rx={1}
          fill="currentColor"
          opacity={i < t.bars ? 1 : 0.2}
        />
      ))}
    </svg>
  );
}
