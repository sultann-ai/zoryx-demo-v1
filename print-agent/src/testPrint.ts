// npm run test-print — prints a local test receipt directly to the configured printer,
// bypassing the backend/socket entirely, so the hardware (or preview rendering) can be
// checked on its own before wiring up the real order flow.
import type { Block, PrintDoc } from "./printProtocol";
import { renderDoc } from "./render";

const blocks: Block[] = [
  { t: "text", text: "Zoryx", align: "center", bold: true, size: 3 },
  { t: "text", text: "Test print", align: "center", size: 2 },
  { t: "rule", style: "dash" },
  { t: "text", text: "Normal size (1)", size: 1 },
  { t: "text", text: "Double height (2)", size: 2 },
  { t: "text", text: "Double width+height (3)", size: 3 },
  { t: "text", text: "Bold text", bold: true },
  { t: "rule", style: "double" },
  { t: "row", left: "A long item name that should wrap onto a second line at this width", right: "250.00" },
  { t: "row", left: "Short item", right: "99.00" },
  { t: "rule", style: "dash" },
  { t: "text", text: 'Char test: 10" pizza x2 - "quoted" & cafe’s menu...' },
  { t: "feed", lines: 2 },
  { t: "drawer" },
  { t: "cut" },
];

const doc: PrintDoc = { blocks };

renderDoc(doc)
  .then(() => {
    console.log("[print-agent] test-print done.");
  })
  .catch((error: unknown) => {
    console.error("[print-agent] test-print failed:", error);
    process.exitCode = 1;
  });
