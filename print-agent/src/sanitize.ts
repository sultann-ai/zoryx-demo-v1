// Thermal printers can't print Unicode. node-thermal-printer already falls back to "?" for
// any character its configured code page can't encode (verified in its source — it never
// throws), but a handful of common punctuation characters deserve a specific ASCII
// equivalent rather than that generic fallback, so receipts stay readable instead of full of
// "?" marks for ordinary text like "10" x 12"" or an em dash.
const REPLACEMENTS: Record<string, string> = {
  "×": "x", // ×
  "·": "*", // ·
  "—": "-", // —
  "–": "-", // –
  "‘": "'", // ‘
  "’": "'", // ’
  "“": '"', // “
  "”": '"', // ”
  "…": "...", // …
};

export function sanitizeText(text: string): string {
  let result = "";
  for (const char of text) {
    result += REPLACEMENTS[char] ?? char;
  }
  return result;
}
