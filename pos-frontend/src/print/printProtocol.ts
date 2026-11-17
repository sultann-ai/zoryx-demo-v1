// Shared print-job shape. Spec + the ack contract: docs/PRINT_PROTOCOL.md.
// Hand-kept in sync with the other two copies (no shared npm package):
//   backend/src/modules/print/printProtocol.ts
//   print-agent/src/printProtocol.ts

export interface PrintJob {
  jobId: string;
  printerId: string;
  doc: PrintDoc;
}

export interface PrintDoc {
  blocks: Block[];
}

export type Block =
  | { t: "text"; text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 | 3 }
  | { t: "row"; left: string; right: string; bold?: boolean }
  | { t: "rule"; style?: "dash" | "double" }
  | { t: "feed"; lines: number }
  | { t: "cut" }
  | { t: "drawer" };

// Same limits the backend enforces on POST /api/pos/print (backend/src/modules/print/
// printProtocol.ts) — a doc over either is rejected whole, so builders stay inside them.
export const MAX_BLOCKS_PER_DOC = 300;
export const MAX_TEXT_LENGTH = 200;
