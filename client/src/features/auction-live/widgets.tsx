import { useEffect, useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300",
  LIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-400",
  RE_AUCTION: "bg-indigo-500/15 text-indigo-300",
  ASSIGNMENT: "bg-indigo-500/15 text-indigo-300",
  COMPLETED: "bg-slate-700/40 text-slate-400",
};

/** Small circular player photo, falling back to the first initial. */
export function PlayerIcon({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return photoUrl ? (
    <img src={photoUrl} alt={name} className="h-5 w-5 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] text-slate-400">
      {name.charAt(0)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`hud-label rounded px-2 py-0.5 text-xs ${STATUS_STYLES[status] ?? "bg-slate-700/40"}`}
    >
      {status}
    </span>
  );
}

/**
 * Format a crore-unit money string for display only. Trims trailing zeros; never
 * used for arithmetic (money math is server-side / decimal). e.g. "5.5000" → "5.5 cr".
 */
export function fmtCr(value: string | null | undefined): string {
  if (value == null) return "—";
  let s = value;
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return `${s} cr`;
}

/** UI-only numeric compare of two money strings (server remains authoritative). */
export function cmpMoney(a: string, b: string): number {
  return Number(a) - Number(b);
}

/** Server-authoritative countdown rendered from endsAt (skew-corrected). */
export function Countdown({ endsAt, skewMs }: { endsAt: string | null; skewMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return <span className="stat">--</span>;
  const ms = Math.max(0, Date.parse(endsAt) - (now + skewMs));
  const secs = Math.ceil(ms / 1000);
  const tone = secs <= 5 ? "text-red-400" : secs <= 10 ? "text-amber-400" : "text-emerald-400";
  return <span className={`stat font-bold ${tone}`}>{secs}s</span>;
}
