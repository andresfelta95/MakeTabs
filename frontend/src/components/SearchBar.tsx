import { useState, useEffect } from "react";

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
      <svg
        className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-secondary transition-colors group-focus-within:text-accent"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search songs, artists…"
        aria-label="Search songs or artists"
        className="w-full rounded-2xl border border-theme bg-card py-4 pl-12 pr-11 text-base
                   text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.25)]
                   placeholder:text-secondary transition
                   focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-secondary transition-colors hover:bg-card-hover hover:text-primary"
        >
          ✕
        </button>
      )}
    </div>
  );
}
