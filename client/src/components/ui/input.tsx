import { forwardRef } from "react";
import type { InputHTMLAttributes, WheelEvent } from "react";
import { cn } from "../../lib/utils.js";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onWheel, ...props }, ref) => {
    // Scrolling over a focused number input mutates its value — blur on wheel so
    // an accidental scroll never changes the number. Caller's onWheel still runs.
    const handleWheel =
      type === "number"
        ? (e: WheelEvent<HTMLInputElement>) => {
            e.currentTarget.blur();
            onWheel?.(e);
          }
        : onWheel;

    return (
      <input
        ref={ref}
        type={type}
        onWheel={handleWheel}
        className={cn(
          "w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
