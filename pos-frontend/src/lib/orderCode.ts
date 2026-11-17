// The 5-character code a guest customer reads out over the phone (K7P2M). Same alphabet as the backend
// (no 0/O/1/I/L, so nothing can be misheard or misread).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ORDER_CODE_LENGTH = 5;

// Trim, upper-case, ignore spaces and dashes; null unless the result could be a real code.
export function normalizeOrderCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== ORDER_CODE_LENGTH) {
    return null;
  }
  return [...code].every((character) => ALPHABET.includes(character)) ? code : null;
}
