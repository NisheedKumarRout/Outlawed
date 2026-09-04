"use client";

import { Search, X } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search interventions, organizations, tags, or places",
  label = "Search insights",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="main-search">
      <Search size={19} aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search">
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
