// Client-side menu search for the order screens (New Order, the order taker's screen, and
// Order Detail's "Add item"). Pure and React-free so it can be checked on its own.
//
// Matching: case-insensitive, any part of a field, every typed word must appear somewhere
// (in any of the record's fields, in any order) — so "chick burg" finds "Zinger Chicken
// Burger". Searched fields are whatever the caller lists: today a menu item's or deal's
// name and description, the only text fields they have. An Urdu/alternate-name field
// added later only needs adding to that list.
//
// Built for hundreds of records per keystroke: each record's text is normalized once into
// a single string when the index is built (memoize it on the menu data), so a search is
// one pass of String.includes calls.

export interface SearchIndexEntry<T> {
  record: T;
  // Normalized name alone — ranks name matches above description-only matches.
  name: string;
  // Normalized text of every searched field, joined.
  haystack: string;
}

// Lower-cases, folds compatibility forms (full-width letters, Arabic presentation forms)
// and drops combining marks — so "Crème" matches "creme", and Urdu typed without diacritics
// still matches text written with them (and vice versa).
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeForSearch(query);
  return normalized === "" ? [] : normalized.split(" ");
}

export function buildSearchIndex<T>(
  records: T[],
  getName: (record: T) => string,
  getOtherFields: (record: T) => (string | null | undefined)[] = () => [],
): SearchIndexEntry<T>[] {
  return records.map((record) => {
    const name = normalizeForSearch(getName(record));
    const others = getOtherFields(record)
      .filter((field): field is string => typeof field === "string" && field.trim() !== "")
      .map(normalizeForSearch);
    return { record, name, haystack: [name, ...others].join("\n") };
  });
}

// 0: name starts with the whole query; 1: every word is in the name; 2: matched only
// with help from another field (e.g. the description).
function rank(entry: SearchIndexEntry<unknown>, tokens: string[], phrase: string): number {
  if (entry.name.startsWith(phrase)) {
    return 0;
  }
  return tokens.every((token) => entry.name.includes(token)) ? 1 : 2;
}

// An empty/blank query returns every record in its original order. Otherwise only matches,
// best first (stable within a rank, so the menu's own order is kept).
export function searchIndex<T>(index: SearchIndexEntry<T>[], query: string): T[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return index.map((entry) => entry.record);
  }
  const phrase = tokens.join(" ");
  return index
    .filter((entry) => tokens.every((token) => entry.haystack.includes(token)))
    .map((entry, position) => ({ entry, position, rank: rank(entry, tokens, phrase) }))
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .map(({ entry }) => entry.record);
}

export function isSearchActive(query: string): boolean {
  return tokenizeQuery(query).length > 0;
}
