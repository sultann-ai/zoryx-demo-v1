// Pakistani mobile numbers: 03XXXXXXXXX, +923XXXXXXXXX or 923XXXXXXXXX, with spaces and dashes
// ignored. Returns the canonical stored form 03XXXXXXXXX, or null when it isn't one of those.
export function normalizePkPhone(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const compact = raw.replace(/[\s-]/g, "");
  const match = /^(?:\+92|92|0)(3\d{9})$/.exec(compact);
  return match ? `0${match[1]}` : null;
}
