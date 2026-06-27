import { nationByCode } from "shared";
import wiFlag from "../../assets/flags/wi.svg";

// Renders a country/team flag for a stored nationality code. Real countries use
// the self-hosted flag-icons SVG set; West Indies uses a bundled custom asset.
// Returns null for custom/free-text values that aren't a known code.
export function Flag({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  const nation = nationByCode(code);
  if (!nation) return null;
  if (nation.fi === "wi") {
    return (
      <img
        src={wiFlag}
        alt=""
        className={`inline-block h-[0.875rem] w-5 shrink-0 rounded-[2px] object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`fi fi-${nation.fi} inline-block shrink-0 rounded-[2px] ${className}`}
      style={{ width: "1.25rem", height: "0.875rem", backgroundSize: "cover" }}
    />
  );
}
