import sharp from "sharp";
import { processPhoto, processProof, processQr, type ProcessedMedia } from "../../src/common/media/processImage";
import type { SeededRandom } from "./random";

// Placeholder pictures for the demo — a soft gradient with the item's name — sent through the same
// processing as a staff upload (processPhoto: 1000x750 WebP + 480x360 thumb). Replace them with real
// photos from "Menu photos and names" before showing the site to customers.

const PALETTES: [string, string, string][] = [
  ["#fde2e4", "#fad2e1", "#7a2e46"],
  ["#e2ece9", "#bee1e6", "#245a5e"],
  ["#fff1e6", "#f0d9c5", "#6b3e1f"],
  ["#f1e6ff", "#dcd0f5", "#4a2f7a"],
  ["#fef9e7", "#f7e3a3", "#6b5310"],
  ["#e8f4ea", "#c9e4c5", "#2f5a35"],
  ["#eaf2fb", "#cfe0f3", "#24476b"],
  ["#fbe9e7", "#f5c6bd", "#7a3524"],
];

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Greedy word wrap to at most `maxChars` per line.
function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  return lines;
}

function photoSvg(title: string, kicker: string, paletteIndex: number): string {
  const [from, to, ink] = PALETTES[paletteIndex % PALETTES.length]!;
  const lines = wrap(title, 18);
  const lineHeight = 84;
  const firstY = 400 - ((lines.length - 1) * lineHeight) / 2;
  const titleTspans = lines
    .map((line, index) => `<tspan x="500" y="${firstY + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" viewBox="0 0 1000 750">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="1000" height="750" fill="url(#bg)"/>
  <circle cx="860" cy="120" r="190" fill="#ffffff" fill-opacity="0.28"/>
  <circle cx="120" cy="660" r="150" fill="#ffffff" fill-opacity="0.22"/>
  <text x="500" y="${firstY - 110}" font-family="Verdana, Arial, sans-serif" font-size="26" letter-spacing="6" fill="${ink}" fill-opacity="0.7" text-anchor="middle">${escapeXml(kicker.toUpperCase())}</text>
  <text font-family="Georgia, 'Times New Roman', serif" font-size="70" font-weight="700" fill="${ink}" text-anchor="middle">${titleTspans}</text>
  <text x="500" y="690" font-family="Verdana, Arial, sans-serif" font-size="22" fill="${ink}" fill-opacity="0.55" text-anchor="middle">Scoops &amp; Slices Café · placeholder photo</text>
</svg>`;
}

export async function placeholderPhoto(title: string, kicker: string, paletteIndex: number): Promise<ProcessedMedia> {
  const png = await sharp(Buffer.from(photoSvg(title, kicker, paletteIndex))).png().toBuffer();
  return processPhoto(png);
}

// Looks like a QR code from across the room; scans as nothing. Clearly marked DEMO.
export async function placeholderQr(label: string, random: SeededRandom): Promise<ProcessedMedia> {
  const modules = 29;
  const cell = 20;
  const margin = 60;
  const size = modules * cell + margin * 2;
  const finder = (x: number, y: number) =>
    `<rect x="${margin + x * cell}" y="${margin + y * cell}" width="${7 * cell}" height="${7 * cell}" fill="#111"/>` +
    `<rect x="${margin + (x + 1) * cell}" y="${margin + (y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/>` +
    `<rect x="${margin + (x + 2) * cell}" y="${margin + (y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#111"/>`;
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > modules - 9 && y < 8) || (x < 8 && y > modules - 9);
  let cells = "";
  for (let y = 0; y < modules; y += 1) {
    for (let x = 0; x < modules; x += 1) {
      if (!inFinder(x, y) && random.chance(0.45)) {
        cells += `<rect x="${margin + x * cell}" y="${margin + y * cell}" width="${cell}" height="${cell}" fill="#111"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 90}">
  <rect width="100%" height="100%" fill="#fff"/>
  ${cells}${finder(0, 0)}${finder(modules - 7, 0)}${finder(0, modules - 7)}
  <rect x="${size / 2 - 120}" y="${size / 2 - 40}" width="240" height="80" fill="#fff" stroke="#c0392b" stroke-width="6"/>
  <text x="${size / 2}" y="${size / 2 + 16}" font-family="Verdana, Arial, sans-serif" font-size="44" font-weight="700" fill="#c0392b" text-anchor="middle">DEMO</text>
  <text x="${size / 2}" y="${size + 50}" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#333" text-anchor="middle">${escapeXml(label)} · not a real account</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return processQr(png);
}

// A phone-screenshot-style payment receipt for the online order waiting for verification.
export async function placeholderProof(amount: string, reference: string): Promise<ProcessedMedia> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1400">
  <rect width="720" height="1400" fill="#f4f6f5"/>
  <rect width="720" height="180" fill="#1aa260"/>
  <text x="360" y="110" font-family="Verdana, Arial, sans-serif" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">Easypaisa</text>
  <circle cx="360" cy="330" r="80" fill="#1aa260"/>
  <path d="M320 330 l28 28 l52 -60" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="360" y="480" font-family="Verdana, Arial, sans-serif" font-size="40" font-weight="700" fill="#222" text-anchor="middle">Transaction Successful</text>
  <text x="360" y="580" font-family="Verdana, Arial, sans-serif" font-size="64" font-weight="700" fill="#111" text-anchor="middle">Rs ${escapeXml(amount)}</text>
  <text x="80" y="720" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#666">To</text>
  <text x="640" y="720" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#222" text-anchor="end">Scoops &amp; Slices Café</text>
  <text x="80" y="790" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#666">Account</text>
  <text x="640" y="790" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#222" text-anchor="end">0300 0000000</text>
  <text x="80" y="860" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#666">Transaction ID</text>
  <text x="640" y="860" font-family="Verdana, Arial, sans-serif" font-size="30" fill="#222" text-anchor="end">${escapeXml(reference)}</text>
  <text x="360" y="1250" font-family="Verdana, Arial, sans-serif" font-size="28" fill="#c0392b" text-anchor="middle">DEMO SCREENSHOT · not a real payment</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return processProof(png);
}
