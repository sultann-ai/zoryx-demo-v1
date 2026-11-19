import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { TableLayout } from "../../api/tables";
import { cn } from "../../components/ui/cn";
import { TableOutline } from "./FloorTile";
import type { ShapeKind } from "./floorGeometry";
import {
  CANVAS_UNITS,
  FULL_VIEW,
  GRID_STEP,
  MAX_SIZE,
  MIN_SIZE,
  boxStyle,
  clamp,
  clampLayout,
  isAspectLocked,
  labelBox,
  normaliseRotation,
  resizeAboutCentre,
  snap,
} from "./floorGeometry";

export interface LayoutDraft {
  id: string;
  name: string;
  // Text, as typed — validated on Save.
  capacityText: string;
  area: string;
  layout: TableLayout | null;
  kind: ShapeKind;
}

type DragMode = "move" | "resize" | "rotate";

interface Drag {
  mode: DragMode;
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  orig: TableLayout;
  locked: boolean;
  // Canvas pixels per unit and its on-screen origin, read once when the drag starts.
  scale: number;
  originX: number;
  originY: number;
}

interface LayoutCanvasProps {
  drafts: LayoutDraft[];
  selectedId: string | null;
  snapToGrid: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, layout: TableLayout) => void;
}

// The editing canvas: the area's full 1000 × 1000 square, scaled to fit, with a grid. Pointer events
// (one code path for mouse, touch and pen) with pointer capture, so a drag that leaves the table
// keeps going. Only the tables and handles take `touch-action: none` — elsewhere a finger still
// scrolls the page.
export function LayoutCanvas({ drafts, selectedId, snapToGrid, onSelect, onChange }: LayoutCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  function begin(event: PointerEvent<HTMLElement>, mode: DragMode, draft: LayoutDraft) {
    if (!draft.layout || !canvasRef.current || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect(draft.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      mode,
      id: draft.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      orig: draft.layout,
      locked: isAspectLocked(draft.kind),
      scale: rect.width / CANVAS_UNITS,
      originX: rect.left,
      originY: rect.top,
    };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const { orig } = drag;
    const dx = (event.clientX - drag.startX) / drag.scale;
    const dy = (event.clientY - drag.startY) / drag.scale;

    if (drag.mode === "move") {
      onChange(drag.id, clampLayout({ ...orig, x: snap(orig.x + dx, snapToGrid), y: snap(orig.y + dy, snapToGrid) }));
      return;
    }
    if (drag.mode === "resize") {
      // The drag in the table's own (rotated) frame; ×2 because it grows on both sides of the centre.
      const rad = (orig.rotation * Math.PI) / 180;
      const localX = dx * Math.cos(rad) + dy * Math.sin(rad);
      const localY = -dx * Math.sin(rad) + dy * Math.cos(rad);
      if (drag.locked) {
        const delta = Math.abs(localX) > Math.abs(localY) ? localX : localY;
        const side = clamp(snap(orig.w + delta * 2, snapToGrid), MIN_SIZE, MAX_SIZE);
        onChange(drag.id, resizeAboutCentre(orig, side, side));
      } else {
        const w = clamp(snap(orig.w + localX * 2, snapToGrid), MIN_SIZE, MAX_SIZE);
        const h = clamp(snap(orig.h + localY * 2, snapToGrid), MIN_SIZE, MAX_SIZE);
        onChange(drag.id, resizeAboutCentre(orig, w, h));
      }
      return;
    }
    // Rotate: the angle from the table's centre to the finger; the handle sits above, so +90°.
    const centreX = drag.originX + (orig.x + orig.w / 2) * drag.scale;
    const centreY = drag.originY + (orig.y + orig.h / 2) * drag.scale;
    const angle = (Math.atan2(event.clientY - centreY, event.clientX - centreX) * 180) / Math.PI + 90;
    onChange(drag.id, { ...orig, rotation: normaliseRotation(snapToGrid ? Math.round(angle / 15) * 15 : angle) });
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>, draft: LayoutDraft) {
    if (!draft.layout) {
      return;
    }
    const step = event.shiftKey ? GRID_STEP * 5 : snapToGrid ? GRID_STEP : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault();
      onSelect(draft.id);
      onChange(draft.id, clampLayout({ ...draft.layout, x: draft.layout.x + delta[0], y: draft.layout.y + delta[1] }));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(draft.id);
    }
  }

  const dragHandlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return (
    <div
      ref={canvasRef}
      onPointerDown={(event) => {
        if (event.target === canvasRef.current) {
          onSelect(null);
        }
      }}
      role="group"
      aria-label="Floor plan editor"
      className="relative mx-auto aspect-square w-full max-w-[min(100%,calc(100dvh-13rem))] min-w-0 select-none rounded-card border border-border bg-surface-raised"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--color-surface) 1px, transparent 1px), linear-gradient(to bottom, var(--color-surface) 1px, transparent 1px)",
        backgroundSize: `${(GRID_STEP / CANVAS_UNITS) * 100}% ${(GRID_STEP / CANVAS_UNITS) * 100}%`,
      }}
    >
      {drafts.map((draft) => {
        if (!draft.layout) {
          return null;
        }
        const isSelected = draft.id === selectedId;
        const { layout } = draft;
        return (
          <div key={draft.id} className={cn("absolute", isSelected ? "z-20" : "z-10")} style={boxStyle(layout, FULL_VIEW)}>
            <div
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${draft.name}. Drag, or use the arrow keys, to move it.`}
              onPointerDown={(event) => begin(event, "move", draft)}
              onKeyDown={(event) => handleKeyDown(event, draft)}
              {...dragHandlers}
              className="group absolute inset-0 cursor-grab touch-none focus-visible:outline-none active:cursor-grabbing"
            >
              <TableOutline
                shape={layout.shape}
                rotation={layout.rotation}
                className={cn(
                  "group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface-raised",
                  isSelected ? "border-accent bg-status-neutral-bg" : "border-ink-muted bg-surface-raised group-hover:bg-surface",
                )}
              />
              <span
                className="@container pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center px-1 text-center"
                style={{ width: `${labelBox(layout).w * 100}%`, height: `${labelBox(layout).h * 100}%` }}
              >
                {/* As on the live map: the name may run past a small table's edge rather than shrink to "Tabl…". */}
                <span className="max-w-[140%] truncate text-meta font-semibold whitespace-nowrap text-ink @min-[64px]:text-body">{draft.name}</span>
                {draft.capacityText && (
                  <span className="hidden max-w-full truncate text-meta text-ink-muted @min-[80px]:block">{draft.capacityText} seats</span>
                )}
              </span>
            </div>

            {isSelected && (
              // Handles turn with the table, so "grow" always points the way the table faces.
              <div className="pointer-events-none absolute inset-0" style={{ transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined }}>
                <span className="absolute -top-5 left-1/2 h-5 w-0.5 -translate-x-1/2 bg-accent" aria-hidden="true" />
                <span
                  aria-hidden="true"
                  onPointerDown={(event) => begin(event, "rotate", draft)}
                  {...dragHandlers}
                  className="pointer-events-auto absolute -top-11 left-1/2 flex h-11 w-11 -translate-x-1/2 cursor-grab touch-none items-center justify-center"
                >
                  <span className="h-4 w-4 rounded-full border-2 border-accent bg-surface-raised" />
                </span>
                <span
                  aria-hidden="true"
                  onPointerDown={(event) => begin(event, "resize", draft)}
                  {...dragHandlers}
                  className="pointer-events-auto absolute -right-[1.375rem] -bottom-[1.375rem] flex h-11 w-11 cursor-nwse-resize touch-none items-center justify-center"
                >
                  <span className="h-3.5 w-3.5 rounded-card border-2 border-surface-raised bg-accent" />
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
