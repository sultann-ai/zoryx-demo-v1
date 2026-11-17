// Digits only, international format, no "+": 923001234567. A number typed the way people write it
// (0300 1234567, +92 300 1234567) is converted when they leave the field.
export function cleanWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("03")) {
    return `92${digits.slice(1)}`;
  }
  return digits;
}
