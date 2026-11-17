import type { PrintDoc } from "./printProtocol";
import { sanitizeText } from "./sanitize";

// node-thermal-printer's own `leftRight()` has no wrapping at all — if left+right don't fit,
// it just concatenates them with no separating space (verified in its source). This resolves
// a PrintDoc into a flat list of printer operations with wrapping/padding already computed,
// consumed identically by the real ESC/POS render path and the preview console renderer, so
// the two can never disagree on layout.
export type LayoutLine =
  | { kind: "text"; text: string; align: "left" | "center" | "right"; bold: boolean; size: 1 | 2 | 3 }
  | { kind: "rule"; text: string }
  | { kind: "feed"; lines: number }
  | { kind: "cut" }
  | { kind: "drawer" };

function wrapRow(left: string, right: string, bold: boolean, width: number): LayoutLine[] {
  const rightPart = right.length > 0 ? ` ${right}` : "";
  const firstLineBudget = Math.max(width - rightPart.length, 1);
  const words = left.split(/\s+/).filter((word) => word.length > 0);

  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    const budget = wrapped.length === 0 ? firstLineBudget : width;
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > budget && current.length > 0) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  wrapped.push(current);

  const firstLine = wrapped[0] ?? "";
  const pad = Math.max(width - firstLine.length - rightPart.length, 0);
  const lines: LayoutLine[] = [
    { kind: "text", text: firstLine + " ".repeat(pad) + rightPart, align: "left", bold, size: 1 },
  ];
  for (let i = 1; i < wrapped.length; i++) {
    lines.push({ kind: "text", text: wrapped[i] ?? "", align: "left", bold, size: 1 });
  }
  return lines;
}

// Word-wraps one text block to the paper. Without this, a line longer than the paper was left
// to the printer, which breaks it mid-word. Size 3 (quad: double width) fits half as many
// characters; size 2 is double height only. A continuation line keeps the original line's
// leading indent plus `hanging` extra spaces, so a wrapped item or note can't be mistaken for
// the next line of its own. A single word longer than a whole line is split hard rather than
// overflowing.
export function wrapText(text: string, widthChars: number, hanging = 0): string[] {
  const width = Math.max(widthChars, 1);
  if (text.length <= width) {
    return [text];
  }
  const indent = /^ */.exec(text)?.[0] ?? "";
  // An indent that leaves no room is dropped rather than looping forever.
  const wanted = indent + " ".repeat(hanging);
  const continuationIndent = wanted.length < width / 2 ? wanted : "";
  const words = text.slice(indent.length).split(/ +/).filter((word) => word.length > 0);

  const lines: string[] = [];
  let current = indent;
  const lineHasWords = () => current.trim().length > 0;
  for (let word of words) {
    while (word.length > 0) {
      const separator = lineHasWords() ? " " : "";
      const room = width - current.length - separator.length;
      if (word.length <= room) {
        current += separator + word;
        word = "";
      } else if (lineHasWords()) {
        lines.push(current);
        current = continuationIndent;
      } else {
        // The word alone is wider than the line: take what fits, carry the rest.
        current += word.slice(0, room);
        word = word.slice(room);
        lines.push(current);
        current = continuationIndent;
      }
    }
  }
  if (lineHasWords()) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [text.slice(0, width)];
}

export function layoutBlocks(doc: PrintDoc, widthChars: number): LayoutLine[] {
  const lines: LayoutLine[] = [];

  for (const block of doc.blocks) {
    switch (block.t) {
      case "text": {
        const size = block.size ?? 1;
        const lineWidth = size === 3 ? Math.floor(widthChars / 2) : widthChars;
        // Hanging indent for left-aligned text only — leading spaces would push a centered
        // continuation line off-centre.
        const align = block.align ?? "left";
        for (const text of wrapText(sanitizeText(block.text), lineWidth, align === "left" ? 2 : 0)) {
          lines.push({ kind: "text", text, align: block.align ?? "left", bold: block.bold ?? false, size });
        }
        break;
      }
      case "row":
        lines.push(...wrapRow(sanitizeText(block.left), sanitizeText(block.right), block.bold ?? false, widthChars));
        break;
      case "rule":
        lines.push({ kind: "rule", text: (block.style === "double" ? "=" : "-").repeat(widthChars) });
        break;
      case "feed":
        lines.push({ kind: "feed", lines: block.lines });
        break;
      case "cut":
        lines.push({ kind: "cut" });
        break;
      case "drawer":
        lines.push({ kind: "drawer" });
        break;
      default:
        // Defensive — the backend validates block shapes before ever dispatching a job, but
        // the agent never crashes on something it doesn't recognize either.
        break;
    }
  }

  return lines;
}
