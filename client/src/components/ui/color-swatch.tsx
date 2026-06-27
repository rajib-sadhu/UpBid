// A small team-color chip. With a secondary color it splits diagonally
// (primary top-left, secondary bottom-right); otherwise it's a solid primary.
const FALLBACK = "#475569";

export function ColorSwatch({
  primary,
  secondary,
  className = "h-4 w-4",
  title,
}: {
  primary: string | null;
  secondary?: string | null;
  className?: string;
  title?: string;
}) {
  const p = primary ?? FALLBACK;
  const style = secondary
    ? { background: `linear-gradient(135deg, ${p} 0 50%, ${secondary} 50% 100%)` }
    : { backgroundColor: p };
  return (
    <span
      className={`shrink-0 rounded-full ${className}`}
      style={style}
      title={title ?? (secondary ? `${p} / ${secondary}` : p)}
    />
  );
}
