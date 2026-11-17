// Area/room filter for the New Order table pickers (POS NewOrderPage and the order taker's
// TakeOrderPage). Chips come from the `area` values actually on the tables passed in —
// nothing is hard-coded — with tables that have no area grouped under "Other". Kept free of
// React so the grouping rules can be checked on their own.

export const ALL_AREAS_KEY = "__all__";
export const OTHER_AREA_KEY = "__other__";
export const OTHER_AREA_LABEL = "Other";

export interface AreaChip {
  key: string;
  label: string;
}

interface HasArea {
  name: string;
  area: string | null;
}

// Case-insensitive so "Family Hall" and "family hall" are one chip (the server already
// trims and collapses whitespace).
export function areaKey(area: string | null): string {
  const normalized = (area ?? "").trim().toLowerCase();
  return normalized === "" ? OTHER_AREA_KEY : normalized;
}

// "Table 2" before "Table 10".
export function compareTableNames(a: HasArea, b: HasArea): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

// One chip per area in use, alphabetical, "Other" last when any table has no area. "All"
// isn't included — the chip row adds it itself.
export function buildAreaChips(tables: HasArea[]): AreaChip[] {
  const labelByKey = new Map<string, string>();
  for (const table of tables) {
    const key = areaKey(table.area);
    if (!labelByKey.has(key)) {
      labelByKey.set(key, key === OTHER_AREA_KEY ? OTHER_AREA_LABEL : (table.area ?? "").trim());
    }
  }
  const named = [...labelByKey.entries()]
    .filter(([key]) => key !== OTHER_AREA_KEY)
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return labelByKey.has(OTHER_AREA_KEY) ? [...named, { key: OTHER_AREA_KEY, label: OTHER_AREA_LABEL }] : named;
}

export function filterByArea<T extends HasArea>(tables: T[], key: string): T[] {
  return key === ALL_AREAS_KEY ? tables : tables.filter((table) => areaKey(table.area) === key);
}

// Tables split per chip, in chip order — for the grouped (headed) layout.
export function groupByArea<T extends HasArea>(tables: T[]): { chip: AreaChip; tables: T[] }[] {
  return buildAreaChips(tables).map((chip) => ({
    chip,
    tables: tables.filter((table) => areaKey(table.area) === chip.key).sort(compareTableNames),
  }));
}

// A remembered key that no longer matches any chip (the area was renamed or emptied) falls
// back to All rather than showing an empty grid.
export function resolveAreaFilter(storedKey: string | null, chips: AreaChip[]): string {
  return storedKey !== null && chips.some((chip) => chip.key === storedKey) ? storedKey : ALL_AREAS_KEY;
}

const STORAGE_KEY = "zoryx:new-order-area-filter";

// sessionStorage: remembered for this browser tab's session only. Every access is guarded —
// storage can be unavailable (private mode, blocked site data) and the picker must still work.
export function loadStoredAreaFilter(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeAreaFilter(key: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Not remembered — the filter still works for this visit.
  }
}
