import type { ReactNode } from "react";
import type { CricketRole, BowlingStyle } from "shared";

// Small inline SVG glyphs for cricket playing roles — used icon-only (with a
// native title tooltip) in dense lists: lot queue, squads, bidding card,
// players table, lineup builder. All strokes/fills use currentColor so the
// icons tint with the surrounding text color.

type SvgProps = { className?: string };

const svg = (className: string | undefined, children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Cricket bat, angled — batsman. */
export function BatIcon({ className }: SvgProps) {
  return svg(
    className,
    <>
      <path d="M18.2 2.8l3 3-1.9 1.9-3-3z" fill="currentColor" stroke="none" />
      <path
        d="M15 6l3 3-8.1 8.1c-.9.9-2.1 1.3-3.3 1l-1.6-.4a1 1 0 0 1-.7-.7l-.4-1.6c-.3-1.2.1-2.4 1-3.3z"
        fill="currentColor"
        stroke="none"
      />
    </>,
  );
}

/** Ball with speed lines — pace / medium-fast bowler. */
export function BallPaceIcon({ className }: SvgProps) {
  return svg(
    className,
    <>
      <circle cx="14.5" cy="12" r="6.2" />
      <path d="M12.4 6.3c-1.9 3.5-1.9 7.9 0 11.4" strokeWidth="1.2" />
      <path d="M1.5 8.5h5M1.5 12h3.5M1.5 15.5h5" />
    </>,
  );
}

/** Ball with rotation arrows — spinner. */
export function BallSpinIcon({ className }: SvgProps) {
  return svg(
    className,
    <>
      <circle cx="12" cy="12" r="5.6" />
      <path d="M10.1 7c-1.7 3.2-1.7 6.8 0 10" strokeWidth="1.2" />
      <path d="M18.3 4.6a10 10 0 0 1 3 4.6" />
      <path d="M21.9 11.2l-.7-3-2.6 1.6z" fill="currentColor" stroke="none" />
      <path d="M5.7 19.4a10 10 0 0 1-3-4.6" />
      <path d="M2.1 12.8l.7 3 2.6-1.6z" fill="currentColor" stroke="none" />
    </>,
  );
}

/** Small bat + ball — all-rounder. */
export function BatBallIcon({ className }: SvgProps) {
  return svg(
    className,
    <>
      <path d="M16.6 2.6l2.3 2.3-1.5 1.5-2.3-2.3z" fill="currentColor" stroke="none" />
      <path
        d="M14.1 5.1l2.3 2.3-6.6 6.6c-.7.7-1.8 1-2.8.8l-1.2-.3a.9.9 0 0 1-.6-.6l-.3-1.2c-.2-1 .1-2.1.8-2.8z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="17" cy="18" r="3.8" />
      <path d="M15.7 15.1c-1 1.8-1 4 0 5.8" strokeWidth="1" />
    </>,
  );
}

/** Keeping glove — wicketkeeper. */
export function GlovesIcon({ className }: SvgProps) {
  return svg(
    className,
    <>
      <path d="M8.5 20.5h6.3a3 3 0 0 0 3-3v-6.3a5.3 5.3 0 0 0-10.6 0v1.9l-1.3-1.5a1.8 1.8 0 0 0-2.8 2.3l3.6 4.9a4.6 4.6 0 0 0 1.8 1.7z" />
      <path d="M12.5 6.1v4.7M15.6 6.8v4" strokeWidth="1.2" />
    </>,
  );
}

const ROLE_TOOLTIPS: Record<Exclude<CricketRole, "BOWLER">, string> = {
  BATSMAN: "Batsman",
  WICKETKEEPER: "Wicketkeeper",
  ALL_ROUNDER: "All-rounder",
};

/**
 * Icon-only cricket role marker with a native tooltip. Renders nothing for a
 * player without a cricket role (football / legacy free-text roles).
 */
export function CricketRoleIcon({
  cricketRole,
  bowlingStyle,
  className = "h-4 w-4",
}: {
  cricketRole: CricketRole | null | undefined;
  bowlingStyle?: BowlingStyle | null;
  className?: string;
}) {
  if (!cricketRole) return null;
  let label: string;
  let icon: ReactNode;
  if (cricketRole === "BOWLER") {
    const spin = bowlingStyle === "SPINNER";
    label = spin ? "Spinner" : "Pace bowler";
    icon = spin ? <BallSpinIcon className={className} /> : <BallPaceIcon className={className} />;
  } else {
    label = ROLE_TOOLTIPS[cricketRole];
    icon =
      cricketRole === "BATSMAN" ? (
        <BatIcon className={className} />
      ) : cricketRole === "WICKETKEEPER" ? (
        <GlovesIcon className={className} />
      ) : (
        <BatBallIcon className={className} />
      );
  }
  return (
    <span title={label} aria-label={label} className="inline-flex shrink-0 text-slate-400">
      {icon}
    </span>
  );
}
