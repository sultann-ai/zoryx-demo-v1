import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const COMPILED_SCRIPT_PATH = join(__dirname, "..", "..", "scripts", "send-raw-print.ps1");
const DEVELOPMENT_SCRIPT_PATH = join(__dirname, "..", "scripts", "send-raw-print.ps1");
const SCRIPT_PATH = existsSync(COMPILED_SCRIPT_PATH) ? COMPILED_SCRIPT_PATH : DEVELOPMENT_SCRIPT_PATH;

// Sends raw ESC/POS bytes to a Windows-installed printer by name, as a RAW spooler job, via
// a PowerShell script that P/Invokes winspool.drv directly. This exists specifically to avoid
// the native `printer` npm module (which node-thermal-printer's own `printer:NAME` interface
// requires and which needs node-gyp/Visual Studio build tools to install) — this path never
// touches the library's interface resolution at all; the caller builds the buffer via
// `.getBuffer()` and hands it here.
export function sendToWindowsPrinter(printerName: string, buffer: Buffer): void {
  const dir = mkdtempSync(join(tmpdir(), "zoryx-print-"));
  const filePath = join(dir, "job.bin");
  try {
    writeFileSync(filePath, buffer);
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_PATH, "-PrinterName", printerName, "-FilePath", filePath],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "unknown error").trim();
      throw new Error(`Failed to print to Windows printer "${printerName}": ${detail}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
