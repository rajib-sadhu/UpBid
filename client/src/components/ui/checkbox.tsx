import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Labelled checkbox. Works with react-hook-form's {...register()} spread. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        ref={ref}
        type="checkbox"
        className={cn("h-4 w-4 rounded border-slate-600 bg-slate-900 accent-indigo-500", className)}
        {...props}
      />
      {label}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";
