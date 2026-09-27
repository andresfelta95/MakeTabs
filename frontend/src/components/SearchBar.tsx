import { useState, useEffect } from "react";
import PixelSprite from "./PixelSprite";
import { SPRITES } from "../lib/sprites";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => onSearch(value.trim()), 400);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className="group relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-secondary transition-colors group-focus-within:text-accent"
      >
        <PixelSprite sprite={SPRITES.magnifier} className="h-[18px] w-[18px]" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search songs, artists…"
        aria-label="Search songs or artists"
        className="w-full border border-theme bg-card py-4 pl-12 pr-11 text-base
                   text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.25)]
                   placeholder:text-secondary transition
                   focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {/* Corner brackets — the field reads as a slot on the rig. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-accent opacity-60"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-accent opacity-60"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 font-mono text-secondary transition-colors hover:text-primary"
        >
          ✕
        </button>
      )}
    </div>
  );
}
