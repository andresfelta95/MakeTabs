import { useState, useEffect } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search songs, artists..."
        className="w-full bg-spotify-card rounded-full px-5 py-3 text-sm text-white placeholder-gray-500
                   focus:outline-none focus:ring-2 focus:ring-spotify-green transition"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  );
}
