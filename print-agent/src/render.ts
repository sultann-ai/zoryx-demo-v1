import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { printer as ThermalPrinter, types as PrinterTypes, characterSet as CharacterSet } from "node-thermal-printer";
import { config, isPreviewMode } from "./config";
import { layoutBlocks } from "./layout";
import type { PrintDoc } from "./printProtocol";
import { sendToWindowsPrinter } from "./windowsRawPrinter";

const OUT_DIR = join(__dirname, "..", "out");

// `printer:NAME` is matched eagerly by node-thermal-printer's own interface resolution (it
// runs synchronously in the ThermalPrinter constructor) and, unlike every other interface
// string, REQUIRES a `driver` object implementing that native `printer` npm module's exact
// shape (`getPrinters`/`getPrinter`/`printDirect`) — it throws "No driver set!" immediately if
// one isn't supplied. We never want that module (node-gyp/Visual Studio build tools), so for
// this case we never let the constructor see a `printer:` string at all: we build the ESC/POS
// buffer with a harmless placeholder interface, pull the bytes out with `.getBuffer()`, and
// send them ourselves via windowsRawPrinter.ts. Preview/dry-run mode uses the same placeholder
// for the same reason (never wants to touch the constructor's real interface resolution).
const PLACEHOLDER_INTERFACE = "buffer-only";

function parseWindowsPrinterName(printerInterface: string): string | null {
  const match = /^printer:(.+)$/i.exec(printerInterface);
  return match ? (match[1] as string) : null;
}

function resolvePrinterType(value: string): string {
  const key = value.toUpperCase() as keyof typeof PrinterTypes;
  return PrinterTypes[key] ?? PrinterTypes.EPSON;
}

function resolveCharacterSet(value: string): string {
  const key = value as keyof typeof CharacterSet;
  return CharacterSet[key] ?? CharacterSet.PC437_USA;
}

function buildRenderedLineForConsole(line: ReturnType<typeof layoutBlocks>[number], widthChars: number): string {
  if (line.kind === "feed") {
    return "\n".repeat(Math.max(line.lines, 0));
  }
  if (line.kind === "cut") {
    return "-".repeat(widthChars) + " CUT ";
  }
  if (line.kind === "drawer") {
    return "[drawer kick]";
  }
  if (line.kind === "rule") {
    return line.text;
  }
  const text = line.bold ? line.text.toUpperCase() : line.text;
  if (line.align === "center") {
    const pad = Math.max(Math.floor((widthChars - text.length) / 2), 0);
    return " ".repeat(pad) + text;
  }
  if (line.align === "right") {
    const pad = Math.max(widthChars - text.length, 0);
    return " ".repeat(pad) + text;
  }
  return text;
}

// Renders the same layout (computed once by layoutBlocks, see layout.ts) to a plain-text
// console preview, so the preview and the real ESC/POS output can never disagree on wrapping.
function renderPreview(doc: PrintDoc): void {
  const lines = layoutBlocks(doc, config.PRINTER_WIDTH_CHARS);
  console.log(`----- preview (${config.PRINTER_WIDTH_CHARS} chars wide) -----`);
  for (const line of lines) {
    console.log(buildRenderedLineForConsole(line, config.PRINTER_WIDTH_CHARS));
  }
  console.log("-".repeat(config.PRINTER_WIDTH_CHARS));
}

export async function renderDoc(doc: PrintDoc): Promise<void> {
  const windowsPrinterName = parseWindowsPrinterName(config.PRINTER_INTERFACE);
  const usesPlaceholder = isPreviewMode() || windowsPrinterName !== null;

  const printer = new ThermalPrinter({
    type: resolvePrinterType(config.PRINTER_TYPE) as any,
    interface: usesPlaceholder ? PLACEHOLDER_INTERFACE : config.PRINTER_INTERFACE,
    width: config.PRINTER_WIDTH_CHARS,
    characterSet: resolveCharacterSet(config.PRINTER_CHARSET) as any,
  });

  for (const line of layoutBlocks(doc, config.PRINTER_WIDTH_CHARS)) {
    switch (line.kind) {
      case "text":
      case "rule": {
        if (line.kind === "text") {
          if (line.align === "center") printer.alignCenter();
          else if (line.align === "right") printer.alignRight();
          else printer.alignLeft();
          printer.bold(line.bold);
          if (line.size === 2) printer.setTextDoubleHeight();
          else if (line.size === 3) printer.setTextQuadArea();
          else printer.setTextNormal();
          printer.println(line.text);
          printer.bold(false);
          printer.setTextNormal();
          printer.alignLeft();
        } else {
          printer.alignLeft();
          printer.println(line.text);
        }
        break;
      }
      case "feed":
        for (let i = 0; i < line.lines; i++) printer.newLine();
        break;
      case "cut":
        if (config.CUT_ENABLED) printer.cut();
        break;
      case "drawer":
        printer.openCashDrawer();
        break;
      default:
        break;
    }
  }

  if (isPreviewMode()) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "last-job.bin"), printer.getBuffer());
    renderPreview(doc);
    return;
  }

  if (windowsPrinterName !== null) {
    sendToWindowsPrinter(windowsPrinterName, printer.getBuffer());
    return;
  }

  // tcp://... (LAN) and a COM/serial path both go through the library's own interface
  // resolution and transport — see lib/interfaces/index.js: tcp:// resolves to a real network
  // socket sender; anything else (including a COM path) falls through to its generic file-
  // write interface. That works for many simple serial/USB-serial thermal printers (raw byte
  // writes, no baud-rate negotiation needed), but hasn't been verified against this cafe's
  // actual hardware — flag this to the user the first time a COM-port interface is configured.
  await printer.execute();
}
