"use client";

import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

export type Filters = {
  sector: string | null;
  targetGroup: string | null;
  geography: string | null;
};

export const EMPTY_FILTERS: Filters = { sector: null, targetGroup: null, geography: null };

function FilterGroup({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string | null;
  onSelect: (value: string | null) => void;
}) {
  if (!options.length) return null;

  return (
    <div className="filter-group">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            // Clicking the active chip clears it, so there is no separate reset
            // control per group to hunt for.
            onClick={() => onSelect(active === option ? null : option)}
            className={cn("filter-chip", active === option && "filter-chip-active")}
            aria-pressed={active === option}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterPanel({
  sectors,
  targetGroups,
  geographies,
  filters,
  onChange,
}: {
  sectors: string[];
  targetGroups: string[];
  geographies: string[];
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <section className="filter-panel" aria-label="Filter insights">
      <header>
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span>Filters</span>
        {activeCount ? (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear {activeCount}
          </button>
        ) : null}
      </header>

      <FilterGroup
        label="Sector"
        options={sectors}
        active={filters.sector}
        onSelect={(sector) => onChange({ ...filters, sector })}
      />
      <FilterGroup
        label="Target group"
        options={targetGroups}
        active={filters.targetGroup}
        onSelect={(targetGroup) => onChange({ ...filters, targetGroup })}
      />
      <FilterGroup
        label="Geography"
        options={geographies}
        active={filters.geography}
        onSelect={(geography) => onChange({ ...filters, geography })}
      />
    </section>
  );
}
