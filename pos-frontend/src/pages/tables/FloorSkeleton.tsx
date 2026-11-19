import { cn } from "../../components/ui/cn";

// Placeholder blocks shaped like what's coming, so nothing moves when the data lands.
const BLOCK = "rounded-card bg-status-neutral-bg motion-safe:animate-pulse";

const FAKE_TABLES = [
  { left: "8%", top: "12%", w: "14%", h: "18%", round: false },
  { left: "30%", top: "12%", w: "14%", h: "18%", round: true },
  { left: "52%", top: "12%", w: "22%", h: "18%", round: false },
  { left: "8%", top: "48%", w: "14%", h: "18%", round: true },
  { left: "30%", top: "48%", w: "22%", h: "18%", round: false },
  { left: "62%", top: "48%", w: "14%", h: "18%", round: false },
];

export function FloorCanvasSkeleton({ square }: { square?: boolean }) {
  return (
    <div
      className={cn("relative w-full rounded-card border border-border bg-surface-raised", square ? "aspect-square" : "aspect-[16/10]")}
      aria-hidden="true"
    >
      {FAKE_TABLES.map((table, index) => (
        <span
          key={index}
          className={cn("absolute", BLOCK, table.round && "rounded-full")}
          style={{ left: table.left, top: table.top, width: table.w, height: table.h }}
        />
      ))}
    </div>
  );
}

export function AreaTabsSkeleton() {
  return (
    <div className="flex gap-2" aria-hidden="true">
      {[96, 120, 88].map((width) => (
        <span key={width} className={cn("h-11", BLOCK)} style={{ width }} />
      ))}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <span className={cn("h-5 w-2/3", BLOCK)} />
      <span className={cn("h-4 w-1/2", BLOCK)} />
      <span className={cn("h-16 w-full", BLOCK)} />
      <span className={cn("h-16 w-full", BLOCK)} />
    </div>
  );
}
