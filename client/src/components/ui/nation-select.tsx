import { useMemo, useState } from "react";
import { NATIONS, nationByCode } from "shared";
import { cn } from "../../lib/utils.js";
import { Flag } from "./flag.js";

// Searchable nationality combobox: type to filter the bundled nation list, pick
// one (stores its code), or — when allowCustom — enter a free-text value for
// anything not listed. Empty is allowed (nationality is optional).
export function NationSelect({
  value,
  onChange,
  id,
  placeholder = "Search nationality…",
  allowCustom = true,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = nationByCode(value);
  const label = selected ? selected.name : value; // custom values show their raw text

  const list = useMemo(() => {
    const t = query.trim().toLowerCase();
    const base = !t
      ? NATIONS
      : NATIONS.filter((nn) => nn.name.toLowerCase().includes(t) || nn.code === t);
    return base.slice(0, 60);
  }, [query]);

  const trimmed = query.trim();
  const showCustom =
    allowCustom &&
    trimmed.length > 0 &&
    !NATIONS.some((nn) => nn.name.toLowerCase() === trimmed.toLowerCase());

  function pick(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-400">
        {value ? <Flag code={value} /> : null}
        <input
          id={id}
          className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          value={open ? query : label}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
        {value ? (
          <button
            type="button"
            className="shrink-0 text-lg leading-none text-slate-500 hover:text-slate-300"
            aria-label="Clear nationality"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange("");
              setQuery("");
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 py-1 shadow-lg">
          {list.map((nn) => (
            <li key={nn.code}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-800",
                  nn.code === value && "bg-slate-800",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(nn.code);
                }}
              >
                <Flag code={nn.code} />
                <span className="truncate text-slate-100">{nn.name}</span>
              </button>
            </li>
          ))}
          {showCustom ? (
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-indigo-300 hover:bg-slate-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(trimmed);
                }}
              >
                Use “{trimmed}”
              </button>
            </li>
          ) : null}
          {list.length === 0 && !showCustom ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
