import { resolveNation } from "shared";
import wiFlag from "../../assets/flags/wi.svg";

export function Flag({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  const nation = resolveNation(code);
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
