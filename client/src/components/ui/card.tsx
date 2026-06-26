import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-slate-800 bg-slate-900/50 p-6", className)}
      {...props}
    />
  );
}
