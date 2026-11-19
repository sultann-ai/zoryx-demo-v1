import qrcode from "qrcode-generator";

// Table QR cards (pages/QrSheetPage.tsx): a QR code drawn as one SVG path, so it stays sharp at any
// print size and needs no canvas or data URL. Error correction "M" (15 %) suits a clean printed card;
// the 4-module quiet zone is the margin scanners need around the code.
const QUIET_ZONE = 4;

export interface QrPath {
  /** Width and height of the viewBox in modules, quiet zone included. */
  size: number;
  /** One "M x y h1 v1 h-1 z" square per dark module. */
  d: string;
}

export function qrPath(text: string): QrPath {
  const qr = qrcode(0, "M"); // 0 = the smallest version that fits the text
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
  }
  return { size: count + QUIET_ZONE * 2, d };
}
