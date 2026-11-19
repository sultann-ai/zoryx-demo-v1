import type { CSSProperties } from "react";
import type { FloorTable, TableShape as TableShapeKind, TableState } from "../../api/tables";
import { cn } from "../../components/ui/cn";
import { labelBox } from "./floorGeometry";
import { CALL_TYPE_LABEL, TABLE_STATE_META, formatElapsed, oldestCall, shapeClassesForState, tileMeta } from "./tableStates";

const DOT_CLASSES = {
  neutral: "bg-status-neutral",
  active: "bg-status-active",
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
} as const;

const TEXT_CLASSES = {
  neutral: "text-status-neutral-text",
  active: "text-status-active-text",
  success: "text-status-success-text",
  warning: "text-status-warning-text",
  danger: "text-status-danger-text",
} as const;

// What a tile's text box must be to show its second and third lines (name, state, time seated).
const FITS_TWO_LINES = "@min-[44px]:[@container(min-height:38px)]:inline-flex";
const FITS_THREE_LINES = "@min-[44px]:[@container(min-height:64px)]:block";

// The state as a small dot + word (StatusBadge's look at meta size, for inside a tile).
// Inside a size container: the full label where it fits, the one-word form in a small tile. The
// caller sets the display (cn doesn't merge classes, so a base "inline-flex" would fight a "hidden").
export function StateLabel({ state, className }: { state: TableState; className: string }) {
  const { label, short, tone } = TABLE_STATE_META[state];
  return (
    <span className={cn("max-w-full items-center gap-1 text-meta font-medium", TEXT_CLASSES[tone], className)}>
      {/* Under 64px the word needs the room; the tile's own colour still carries the tone. */}
      <span className={cn("hidden h-1.5 w-1.5 shrink-0 rounded-full @min-[64px]:inline-block", DOT_CLASSES[tone])} aria-hidden="true" />
      <span className="truncate leading-tight @min-[112px]:hidden">{short}</span>
      <span className="hidden truncate leading-tight @min-[112px]:inline">{label}</span>
    </span>
  );
}

// The table's outline, rotated about its centre. Text is never rotated (it sits on a layer above),
// so a table turned 45° still reads straight. Colour changes fade, so a live update doesn't jump.
export function TableOutline({
  shape,
  rotation,
  className,
  style,
}: {
  shape: TableShapeKind;
  rotation: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-0 border-2 transition-[background-color,border-color,box-shadow] duration-300",
        shape === "ROUND" ? "rounded-full" : "rounded-card",
        className,
      )}
      style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined, ...style }}
    />
  );
}

// "Call · Water · 3m" — the open-waiter-call badge. Danger tone, and a ping that pulses for as long
// as a call is open (stronger once it's escalated). motion-safe: reduced-motion users get a still badge.
export function CallChip({ table, now, className }: { table: FloorTable; now: number; className?: string }) {
  const call = oldestCall(table);
  if (!call || !table.attention) {
    return null;
  }
  const extra = (table.session?.openCalls.length ?? 1) - 1;
  const escalated = table.attention === "ESCALATED";
  return (
    <span
      className={cn(
        "pointer-events-none inline-flex items-center gap-1 rounded-full bg-status-danger px-2 py-0.5 text-meta font-semibold whitespace-nowrap text-white",
        className,
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping",
            !escalated && "[animation-duration:2s]",
          )}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      <span>
        {CALL_TYPE_LABEL[call.type]}
        {extra > 0 ? ` +${extra}` : ""} · {formatElapsed(call.createdAt, now)}
      </span>
    </span>
  );
}

interface FloorTileProps {
  table: FloorTable;
  now: number;
  isSelected: boolean;
  onSelect: () => void;
  style?: CSSProperties;
  // "map": positioned on the canvas · "card": a plain card in the Not-on-map grid.
  variant: "map" | "card";
}

// One table on the live map: a real button (keyboard and screen readers walk the map in reading
// order), whose accessible name says everything the colours do.
export function FloorTile({ table, now, isSelected, onSelect, style, variant }: FloorTileProps) {
  const layout = table.layout;
  const shape = layout?.shape ?? "RECT";
  const rotation = layout?.rotation ?? 0;
  const meta = tileMeta(table, now);
  const text = variant === "map" && layout ? labelBox(layout) : { w: 1, h: 1 };
  const call = oldestCall(table);
  const paying = table.state === "PAYING" && table.session?.bill;
  const label = [
    table.name,
    TABLE_STATE_META[table.state].label,
    meta,
    call ? `waiter call: ${CALL_TYPE_LABEL[call.type]}${table.attention === "ESCALATED" ? ", waiting too long" : ""}` : "",
    paying ? `${table.session?.bill?.paid} of ${table.session?.bill?.of} paid` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={isSelected}
      style={style}
      className={cn(
        "group border-0 bg-transparent p-0 text-left font-body text-ink",
        "focus-visible:outline-none",
        variant === "map" ? "absolute" : "relative h-24 w-full",
      )}
    >
      <TableOutline
        shape={variant === "map" ? shape : "RECT"}
        rotation={variant === "map" ? rotation : 0}
        className={cn(
          shapeClassesForState(table.state),
          "group-hover:brightness-[0.97] group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface-raised",
          table.attention && "ring-2 ring-status-danger ring-offset-2 ring-offset-surface-raised",
          table.attention === "ESCALATED" && "motion-safe:animate-pulse",
          isSelected && "border-accent shadow-[0_0_0_2px_var(--color-accent)]",
        )}
      />
      <span
        className={cn(
          "@container absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 text-center",
          // Text stays inside a circle's curve (two short lines across the middle), not just its box.
          variant === "map" && shape === "ROUND" ? "px-[8%]" : "px-1",
        )}
        // A size container (it has a set size), so short tiles drop lines by height as well as width.
        style={{ width: `${text.w * 100}%`, height: `${text.h * 100}%`, containerType: "size" }}
      >
        {/* The name may run a little past a small table's edge rather than shrink to "Tabl…". */}
        <span className="max-w-[140%] truncate text-meta leading-tight font-semibold whitespace-nowrap @min-[64px]:text-body">{table.name}</span>
        <StateLabel state={table.state} className={cn("hidden", FITS_TWO_LINES)} />
        {table.session && (
          // Time seated on every tile that has room for a line; guests too once it's wide enough.
          <span className={cn("hidden max-w-full truncate text-meta text-ink-muted tabular-nums lining-nums", FITS_THREE_LINES)}>
            <span className="@min-[120px]:hidden">{formatElapsed(table.session.seatedAt, now)}</span>
            <span className="hidden @min-[120px]:inline">{meta}</span>
          </span>
        )}
        {!table.session && meta && (
          <span className={cn("hidden max-w-full truncate text-meta text-ink-muted tabular-nums lining-nums", "@min-[120px]:[@container(min-height:64px)]:block")}>
            {meta}
          </span>
        )}
        {!paying && table.readyCount > 0 && (
          <span className="hidden text-meta font-semibold text-status-success-text @min-[104px]:[@container(min-height:72px)]:block">
            {table.readyCount} ready
          </span>
        )}
      </span>
      {paying && (
        // Below the table like the call chip sits above it, so it's never clipped by a small tile.
        <span className="pointer-events-none absolute -bottom-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-status-active bg-surface-raised px-1.5 text-meta font-semibold whitespace-nowrap text-status-active-text tabular-nums">
          {table.session?.bill?.paid}/{table.session?.bill?.of} paid
        </span>
      )}
      {table.attention && (
        // Sits on the top edge, overlapping it only slightly, so it never covers a small table's name.
        <span className="absolute bottom-full left-1/2 z-10 -mb-1.5 flex -translate-x-1/2 justify-center">
          <CallChip table={table} now={now} />
        </span>
      )}
    </button>
  );
}
