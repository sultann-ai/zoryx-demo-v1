import { useState } from "react";
import type { TableLayout } from "../../api/tables";
import { Button, Input } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import type { LayoutDraft } from "./LayoutCanvas";
import type { ShapeKind } from "./floorGeometry";
import { CANVAS_UNITS, MAX_SIZE, MIN_SIZE, clamp, normaliseRotation, resizeAboutCentre } from "./floorGeometry";

const LABEL = "text-meta font-medium text-ink-muted";

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "ROUND", label: "Round" },
  { kind: "SQUARE", label: "Square" },
  { kind: "RECT", label: "Rectangle" },
];

const CHOICE_CLASSES =
  "inline-flex h-11 flex-1 items-center justify-center rounded-card border px-3 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised";

// A number typed in full before it applies (on blur or Enter), so "1" on the way to "120" doesn't
// shrink the table. Remounted by the caller's key when the value changes elsewhere (a drag).
function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
  disabled,
  hideLabel,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  // For a field whose group already says what it is (Rotation): named for screen readers only.
  hideLabel?: boolean;
}) {
  const [text, setText] = useState(String(value));
  function commit() {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const next = clamp(Math.round(parsed), min, max);
    setText(String(next));
    if (next !== value) {
      onCommit(next);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : LABEL}>
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        className="tabular-nums"
      />
    </div>
  );
}

interface LayoutInspectorProps {
  draft: LayoutDraft;
  onChange: (patch: Partial<LayoutDraft>) => void;
  onRemove: () => void;
}

// The selected table's details. Every drag has a typed equivalent here (x/y/w/h/rotation), so the
// editor works without precise pointer control.
export function LayoutInspector({ draft, onChange, onRemove }: LayoutInspectorProps) {
  const layout = draft.layout;
  const prefix = `layout-${draft.id}`;

  function setLayout(next: TableLayout) {
    onChange({ layout: next });
  }

  function setKind(kind: ShapeKind) {
    if (!layout) {
      onChange({ kind });
      return;
    }
    const shape = kind === "ROUND" ? "ROUND" : "RECT";
    if (kind === "RECT") {
      // A square becoming a rectangle gets a visibly different side, or it would read as square again.
      const next = layout.w === layout.h ? resizeAboutCentre(layout, Math.min(MAX_SIZE, Math.round(layout.w * 1.6)), layout.h) : layout;
      onChange({ kind, layout: { ...next, shape } });
      return;
    }
    const side = Math.max(layout.w, layout.h);
    onChange({ kind, layout: { ...resizeAboutCentre(layout, side, side), shape } });
  }

  const nameMissing = draft.name.trim() === "";
  const seatsInvalid = draft.capacityText.trim() !== "" && !/^[1-9]\d{0,2}$/.test(draft.capacityText.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${prefix}-name`} className={LABEL}>
            Name
          </label>
          <Input
            id={`${prefix}-name`}
            value={draft.name}
            maxLength={60}
            aria-invalid={nameMissing}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${prefix}-seats`} className={LABEL}>
            Seats
          </label>
          <Input
            id={`${prefix}-seats`}
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.capacityText}
            aria-invalid={seatsInvalid}
            onChange={(event) => onChange({ capacityText: event.target.value })}
            className="tabular-nums"
          />
        </div>
      </div>
      {nameMissing && <p className="m-0 -mt-2 text-meta text-status-danger-text">A table needs a name.</p>}
      {seatsInvalid && <p className="m-0 -mt-2 text-meta text-status-danger-text">Seats must be a whole number, or empty.</p>}

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className={cn(LABEL, "mb-1.5 p-0")}>Shape</legend>
        <div className="flex gap-2">
          {SHAPES.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={draft.kind === kind}
              onClick={() => setKind(kind)}
              className={cn(
                CHOICE_CLASSES,
                draft.kind === kind ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {layout ? (
        <>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>Rotation</span>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
              <Button variant="secondary" aria-label="Rotate 15 degrees left" onClick={() => setLayout({ ...layout, rotation: normaliseRotation(layout.rotation - 15) })}>
                ↺ 15°
              </Button>
              <NumberField
                key={`r-${layout.rotation}`}
                id={`${prefix}-rotation`}
                label="Rotation in degrees"
                hideLabel
                value={layout.rotation}
                min={0}
                max={359}
                onCommit={(rotation) => setLayout({ ...layout, rotation })}
              />
              <Button variant="secondary" aria-label="Rotate 15 degrees right" onClick={() => setLayout({ ...layout, rotation: normaliseRotation(layout.rotation + 15) })}>
                ↻ 15°
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              key={`x-${layout.x}`}
              id={`${prefix}-x`}
              label="Left"
              value={layout.x}
              min={0}
              max={CANVAS_UNITS - layout.w}
              onCommit={(x) => setLayout({ ...layout, x })}
            />
            <NumberField
              key={`y-${layout.y}`}
              id={`${prefix}-y`}
              label="Top"
              value={layout.y}
              min={0}
              max={CANVAS_UNITS - layout.h}
              onCommit={(y) => setLayout({ ...layout, y })}
            />
            <NumberField
              key={`w-${layout.w}`}
              id={`${prefix}-w`}
              label={draft.kind === "RECT" ? "Width" : "Size"}
              value={layout.w}
              min={MIN_SIZE}
              max={MAX_SIZE}
              onCommit={(w) => setLayout(resizeAboutCentre(layout, w, draft.kind === "RECT" ? layout.h : w))}
            />
            <NumberField
              key={`h-${layout.h}`}
              id={`${prefix}-h`}
              label="Depth"
              value={layout.h}
              min={MIN_SIZE}
              max={MAX_SIZE}
              disabled={draft.kind !== "RECT"}
              onCommit={(h) => setLayout(resizeAboutCentre(layout, layout.w, h))}
            />
          </div>
          <p className="m-0 -mt-2 text-meta text-ink-muted">Units on a 1000 × 1000 floor. Arrow keys move the selected table too.</p>

          <Button variant="danger" onClick={onRemove}>
            Take off the floor plan
          </Button>
        </>
      ) : (
        <p className="m-0 text-body text-ink-muted">Not on the floor plan yet.</p>
      )}
    </div>
  );
}
