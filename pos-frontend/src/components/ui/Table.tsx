import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

// "stack" (the default): below md, each row becomes a block of "Label  value"
// lines — right for the great majority of tables here, which are one record
// per row. "scroll": keeps the real table (and its horizontal scrollbar) at
// every width — for a genuine matrix, like the Attendance grid's employee ×
// date grid, where stacking would turn one row into a wall of "date: status"
// pairs instead of a small grid you scroll sideways through.
export type TableMobileLayout = "stack" | "scroll";

const TableLayoutContext = createContext<TableMobileLayout>("stack");

// Copies each column's header text onto the cells beneath it as data-label, so
// the mobile layout can print "Label  value" per cell with CSS alone. Reading
// the real DOM (rather than threading labels through props or context) keeps
// every existing table working unchanged — conditional columns, fragments and
// mapped cells included. A column with an empty header (the actions column)
// gets no label.
function applyLabels(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
  table.querySelectorAll("tbody tr").forEach((row) => {
    Array.from(row.children).forEach((cell, index) => {
      const label = headers[index];
      if (label) {
        if (cell.getAttribute("data-label") !== label) {
          cell.setAttribute("data-label", label);
        }
      } else if (cell.hasAttribute("data-label")) {
        cell.removeAttribute("data-label");
      }
    });
  });
}

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  mobileLayout?: TableMobileLayout;
}

// The primary surface for list views — real tables with hairline dividers,
// not a stack of cards. See Card.tsx for when a card is actually earned.
//
// Below md (768px) a "stack" table stops being a table: every row becomes a
// compact block of "Label  value" lines, still separated by the same
// hairlines — plain list rows, no cards, no horizontal scrolling. The header
// row stays in the DOM (visually hidden) and explicit ARIA roles keep the
// table semantics that browsers otherwise drop when a table's display is
// changed. Pass mobileLayout="scroll" to opt a genuine matrix out of this —
// see TableMobileLayout above.
export function Table({ className, mobileLayout = "stack", ...props }: TableProps) {
  const tableRef = useRef<HTMLTableElement>(null);

  // After every render, so rows added or reordered by React are labelled
  // before the browser paints. Skipped in "scroll" mode: nothing reads
  // data-label there, so there's nothing to keep in sync.
  useLayoutEffect(() => {
    if (mobileLayout === "stack" && tableRef.current) {
      applyLabels(tableRef.current);
    }
  });

  // Covers content that changes without this component re-rendering.
  useEffect(() => {
    const table = tableRef.current;
    if (mobileLayout !== "stack" || !table) {
      return;
    }
    const observer = new MutationObserver(() => applyLabels(table));
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [mobileLayout]);

  return (
    <TableLayoutContext.Provider value={mobileLayout}>
      <div className={cn("overflow-x-auto rounded-card border border-border bg-surface-raised", className)}>
        <table
          ref={tableRef}
          role="table"
          className={cn("w-full border-collapse text-body text-ink", mobileLayout === "stack" && "max-md:block")}
          {...props}
        />
      </div>
    </TableLayoutContext.Provider>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  const mode = useContext(TableLayoutContext);
  return <thead role="rowgroup" className={cn(mode === "stack" && "max-md:sr-only", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  const mode = useContext(TableLayoutContext);
  return <tbody role="rowgroup" className={cn(mode === "stack" && "max-md:block", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  const mode = useContext(TableLayoutContext);
  return (
    <tr
      role="row"
      className={cn(
        "border-b border-border last:border-b-0",
        mode === "stack" && "max-md:block max-md:px-4 max-md:py-3",
        className,
      )}
      {...props}
    />
  );
}

export function TableHeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      role="columnheader"
      className={cn("px-3 py-2 text-left text-meta font-semibold text-ink-muted", className)}
      {...props}
    />
  );
}

// Mobile ("stack" only): a flex line with the label (from data-label) on the
// left and the value on the right. max-md:w-full cancels any fixed column
// width a page put on a cell for the desktop layout.
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  const mode = useContext(TableLayoutContext);
  return (
    <td
      role="cell"
      className={cn(
        "px-3 py-2 text-body",
        mode === "stack" &&
          "max-md:flex max-md:w-full max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:break-words max-md:px-0 max-md:py-1 max-md:text-right " +
            "max-md:data-[label]:before:shrink-0 max-md:data-[label]:before:text-left max-md:data-[label]:before:text-meta max-md:data-[label]:before:font-medium max-md:data-[label]:before:text-ink-muted max-md:data-[label]:before:content-[attr(data-label)]",
        className,
      )}
      {...props}
    />
  );
}
