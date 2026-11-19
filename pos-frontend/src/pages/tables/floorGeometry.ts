import type { TableLayout } from "../../api/tables";

// Floor geometry in the server's abstract units: a 1000 × 1000 canvas per area, x/y the top-left of
// the unrotated box, rotation about the centre. Limits mirror PUT /tables/layout's validator.
export const CANVAS_UNITS = 1000;
export const MIN_SIZE = 20;
export const MAX_SIZE = 400;
export const GRID_STEP = 20;

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_VIEW: ViewBox = { x: 0, y: 0, w: CANVAS_UNITS, h: CANVAS_UNITS };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snap(value: number, enabled: boolean, step = GRID_STEP): number {
  return enabled ? Math.round(value / step) * step : Math.round(value);
}

// The axis-aligned box a rotated table actually covers.
function rotatedBounds(layout: TableLayout): ViewBox {
  const rad = (layout.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = layout.w * cos + layout.h * sin;
  const h = layout.w * sin + layout.h * cos;
  const cx = layout.x + layout.w / 2;
  const cy = layout.y + layout.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// The live map shows only the part of the canvas that holds tables (plus a margin), so a small
// floor isn't drawn tiny in one corner of a big empty square.
export function fitViewBox(layouts: TableLayout[], padding = 40, minSize = 360): ViewBox {
  if (layouts.length === 0) {
    return FULL_VIEW;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layout of layouts) {
    const box = rotatedBounds(layout);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  let w = maxX - minX + padding * 2;
  let h = maxY - minY + padding * 2;
  let x = minX - padding;
  let y = minY - padding;
  if (w < minSize) {
    x -= (minSize - w) / 2;
    w = minSize;
  }
  if (h < minSize) {
    y -= (minSize - h) / 2;
    h = minSize;
  }
  return { x, y, w, h };
}

// The upright box a tile's text may use, as a share of the unrotated box. Text never turns with the
// table, so a long table turned 90° only has its depth across. At an angle, the width is most of the
// horizontal line through the centre (the text is a short band there), the height the square inside.
export function labelBox(layout: Pick<TableLayout, "w" | "h" | "rotation">): { w: number; h: number } {
  const rad = (layout.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  if (sin < 0.26) {
    return { w: 1, h: 1 };
  }
  if (cos < 0.26) {
    return { w: layout.h / layout.w, h: layout.w / layout.h };
  }
  const across = 0.8 * Math.min(layout.w / cos, layout.h / sin);
  const side = Math.min(layout.w, layout.h) / (cos + sin);
  return { w: across / layout.w, h: side / layout.h };
}

// Percent positions inside a view box — the canvas scales with its container, no pixel maths.
export function boxStyle(layout: Pick<TableLayout, "x" | "y" | "w" | "h">, view: ViewBox) {
  return {
    left: `${((layout.x - view.x) / view.w) * 100}%`,
    top: `${((layout.y - view.y) / view.h) * 100}%`,
    width: `${(layout.w / view.w) * 100}%`,
    height: `${(layout.h / view.h) * 100}%`,
  };
}

// The editor offers three shapes; the server stores two. A square is a RECT whose sides match,
// and round and square tables keep equal sides while being resized.
export type ShapeKind = "ROUND" | "SQUARE" | "RECT";

export function shapeKindOf(layout: TableLayout): ShapeKind {
  if (layout.shape === "ROUND") {
    return "ROUND";
  }
  return layout.w === layout.h ? "SQUARE" : "RECT";
}

export function isAspectLocked(kind: ShapeKind): boolean {
  return kind !== "RECT";
}

// Reading order (top to bottom, then left to right) for keyboard and screen-reader users: the map is
// a set of buttons, and their DOM order is the order Tab walks through them.
type Ordered = { name: string; layout: TableLayout | null };

export function readingOrder(a: Ordered, b: Ordered): number {
  if (!a.layout || !b.layout) {
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  }
  const rowA = Math.round(a.layout.y / 80);
  const rowB = Math.round(b.layout.y / 80);
  return rowA !== rowB ? rowA - rowB : a.layout.x - b.layout.x;
}

// A sensible first size for a table being placed, from its seat count.
export function defaultSize(capacity: number | null): { w: number; h: number } {
  const seats = capacity ?? 4;
  if (seats <= 2) {
    return { w: 80, h: 80 };
  }
  if (seats <= 4) {
    return { w: 100, h: 100 };
  }
  if (seats <= 6) {
    return { w: 160, h: 100 };
  }
  return { w: 200, h: 120 };
}

function overlaps(a: ViewBox, b: ViewBox, gap: number): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

// The first free grid spot, scanning left to right, top to bottom; the centre if the floor is full.
export function findFreeSpot(size: { w: number; h: number }, taken: TableLayout[]): { x: number; y: number } {
  const boxes = taken.map(rotatedBounds);
  for (let y = GRID_STEP * 2; y + size.h <= CANVAS_UNITS - GRID_STEP; y += GRID_STEP) {
    for (let x = GRID_STEP * 2; x + size.w <= CANVAS_UNITS - GRID_STEP; x += GRID_STEP) {
      const candidate = { x, y, w: size.w, h: size.h };
      if (!boxes.some((box) => overlaps(candidate, box, GRID_STEP))) {
        return { x, y };
      }
    }
  }
  return { x: (CANVAS_UNITS - size.w) / 2, y: (CANVAS_UNITS - size.h) / 2 };
}

// Keeps the whole box on the canvas, as PUT /tables/layout requires.
export function clampLayout(layout: TableLayout): TableLayout {
  const w = clamp(Math.round(layout.w), MIN_SIZE, MAX_SIZE);
  const h = clamp(Math.round(layout.h), MIN_SIZE, MAX_SIZE);
  return {
    ...layout,
    w,
    h,
    x: clamp(Math.round(layout.x), 0, CANVAS_UNITS - w),
    y: clamp(Math.round(layout.y), 0, CANVAS_UNITS - h),
  };
}

export function normaliseRotation(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

// Resizes about the centre, so a rotated table grows in place instead of drifting.
export function resizeAboutCentre(layout: TableLayout, w: number, h: number): TableLayout {
  const cx = layout.x + layout.w / 2;
  const cy = layout.y + layout.h / 2;
  return clampLayout({ ...layout, w, h, x: cx - w / 2, y: cy - h / 2 });
}
