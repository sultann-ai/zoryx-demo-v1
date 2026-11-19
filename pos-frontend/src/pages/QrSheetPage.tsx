import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { QrSheetTable } from "../api/tables";
import { BrandLogo } from "../components/BrandLogo";
import { QrCardStyles, type QrLayout } from "../components/QrCardStyles";
import { Button, ConfirmDialog, EmptyState, Select, buttonClassName } from "../components/ui";
import { useQrSheet, useRegenerateTableQrKey } from "../hooks/useTables";
import { ONLINE_SITE_URL } from "../lib/mediaUrl";
import { qrPath } from "../lib/qrSvg";

// /tables/qr-sheet (SUPER_ADMIN, POS_ADMIN) — Table QR build step 7. Standalone like the receipt
// print view (no sidebar), so what's on screen is what prints. One branded card per active table:
// logo, table name + area, a QR to `${VITE_ONLINE_SITE_URL}/t/<qrKey>`, and "Scan to order and call
// your waiter" in Urdu and English. Two layouts: A4 with 6 cards, or one 10 x 15 cm tent per page.

const ALL = "__all";
const NO_AREA = "__none";
const PER_A4 = 6;

const SITE = ONLINE_SITE_URL.replace(/\/+$/, "");

const tableQrUrl = (qrKey: string): string => `${SITE}/t/${qrKey}`;

function QrCode({ qrKey, label }: { qrKey: string; label: string }) {
  const { size, d } = useMemo(() => qrPath(tableQrUrl(qrKey)), [qrKey]);
  return (
    <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <path d={d} />
    </svg>
  );
}

function QrCard({
  table,
  layout,
  isNew,
  onRegenerate,
}: {
  table: QrSheetTable;
  layout: QrLayout;
  isNew: boolean;
  onRegenerate: () => void;
}) {
  return (
    <article className="qr-card" aria-label={`QR card for ${table.name}`}>
      <div className="qr-band">
        <BrandLogo variant="reversed" size={layout === "tent" ? 30 : 22} />
      </div>
      <p className="qr-name">{table.name}</p>
      {table.area && <p className="qr-area">{table.area}</p>}
      <QrCode qrKey={table.qrKey} label={`QR code that opens ordering for ${table.name}`} />
      <p className="qr-ur" lang="ur" dir="rtl">
        آرڈر دینے اور ویٹر بلانے کے لیے اسکین کریں
      </p>
      <p className="qr-en">Scan to order and call your waiter</p>

      {/* Screen-only controls on the card; none of this prints. */}
      <div className="no-print absolute end-2 top-[17mm] flex flex-col items-end gap-1">
        {isNew && (
          <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-meta font-medium text-status-warning-text">
            New QR — print this card
          </span>
        )}
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-full border border-border bg-surface-raised px-3 py-1 text-meta font-medium text-ink hover:bg-surface"
        >
          New QR…
        </button>
      </div>
    </article>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function QrSheetPage() {
  const sheet = useQrSheet();
  const regenerate = useRegenerateTableQrKey();
  const [layout, setLayout] = useState<QrLayout>("a4");
  const [area, setArea] = useState(ALL);
  const [onlyNew, setOnlyNew] = useState(false);
  // Tables whose QR was regenerated here: their old printed card is dead, so they need reprinting.
  const [renewed, setRenewed] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState<QrSheetTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tables = useMemo(() => sheet.data ?? [], [sheet.data]);
  const areas = useMemo(() => [...new Set(tables.map((t) => t.area).filter((a): a is string => !!a))].sort(), [tables]);
  const hasNoArea = tables.some((t) => !t.area);
  const shown = tables.filter(
    (t) => (area === ALL || (area === NO_AREA ? !t.area : t.area === area)) && (!onlyNew || renewed.has(t.id)),
  );

  function handleRegenerate() {
    if (!confirming) return;
    const table = confirming;
    setError(null);
    regenerate.mutate(table.id, {
      onSuccess: () => {
        setRenewed((current) => new Set(current).add(table.id));
        setConfirming(null);
      },
      onError: (regenerateError) => setError(getApiErrorMessage(regenerateError, "Couldn't make a new QR code")),
    });
  }

  const toolbar = (
    <header className="no-print sticky top-0 z-10 border-b border-border bg-surface-raised px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link to="/tables" className="text-meta font-medium text-ink-muted hover:text-ink">
            ← Tables
          </Link>
          <h1 className="font-heading text-title text-ink">Table QR cards</h1>
        </div>
        <div role="group" aria-label="Paper" className="flex gap-1 rounded-card border border-border p-1">
          {(
            [
              ["a4", "A4 · 6 per page"],
              ["tent", "Table tent · 10 × 15 cm"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
              className={buttonClassName(layout === value ? "primary" : "secondary", "md", "border-0")}
            >
              {label}
            </button>
          ))}
        </div>
        {(areas.length > 0 || hasNoArea) && areas.length + (hasNoArea ? 1 : 0) > 1 && (
          <label className="flex flex-col gap-1 text-meta font-medium text-ink-muted">
            Area
            <Select value={area} onChange={(event) => setArea(event.target.value)} className="min-w-40">
              <option value={ALL}>All areas</option>
              {areas.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {hasNoArea && <option value={NO_AREA}>Other</option>}
            </Select>
          </label>
        )}
        {renewed.size > 0 && (
          <label className="flex h-11 items-center gap-2 text-body text-ink">
            <input type="checkbox" checked={onlyNew} onChange={(event) => setOnlyNew(event.target.checked)} className="size-5" />
            Only new QR cards ({renewed.size})
          </label>
        )}
        <Button onClick={() => window.print()} disabled={shown.length === 0}>
          Print {shown.length} {shown.length === 1 ? "card" : "cards"}
        </Button>
      </div>
      <p className="mx-auto mt-2 max-w-5xl text-meta text-ink-muted">
        In the print dialog set the scale to 100 % (“Actual size”) and the paper to{" "}
        {layout === "a4" ? "A4" : "10 × 15 cm (4 × 6 in)"}. Each code opens {SITE}/t/…
      </p>
    </header>
  );

  if (!SITE) {
    return (
      <div className="min-h-dvh bg-surface p-6">
        <EmptyState
          title="The customer website address isn't set"
          description="QR cards point guests at the customer website, so they can't be made until VITE_ONLINE_SITE_URL is set for the POS (e.g. https://order.example.com) and the POS is rebuilt."
          action={
            <Link to="/tables" className={buttonClassName("secondary")}>
              Back to tables
            </Link>
          }
        />
      </div>
    );
  }

  let body;
  if (sheet.isPending) {
    body = (
      <p role="status" className="no-print p-8 text-center text-body text-ink-muted">
        Loading tables…
      </p>
    );
  } else if (sheet.isError) {
    body = (
      <div role="alert" className="no-print flex flex-col items-center gap-3 p-8">
        <p className="text-body text-status-danger-text">{getApiErrorMessage(sheet.error, "Couldn't load the tables")}</p>
        <Button variant="secondary" onClick={() => void sheet.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (tables.length === 0) {
    body = (
      <div className="no-print p-6">
        <EmptyState
          title="No tables yet"
          description="Add your tables in Dining areas, then come back to print their QR cards."
          action={
            <Link to="/dining-areas" className={buttonClassName("primary")}>
              Dining areas
            </Link>
          }
        />
      </div>
    );
  } else if (shown.length === 0) {
    body = <p className="no-print p-8 text-center text-body text-ink-muted">No tables match.</p>;
  } else {
    const pages = layout === "a4" ? chunk(shown, PER_A4) : shown.map((table) => [table]);
    body = (
      <div className="qr-pages">
        {pages.map((page) => (
          <section key={page[0].id} className={`qr-page ${layout === "a4" ? "qr-page-a4" : "qr-page-tent"}`}>
            {page.map((table) => (
              <QrCard
                key={table.id}
                table={table}
                layout={layout}
                isNew={renewed.has(table.id)}
                onRegenerate={() => {
                  setError(null);
                  setConfirming(table);
                }}
              />
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface">
      <QrCardStyles layout={layout} />
      {toolbar}
      <main className="overflow-x-auto">{body}</main>
      <ConfirmDialog
        isOpen={confirming !== null}
        onClose={() => {
          setConfirming(null);
          setError(null);
        }}
        onConfirm={handleRegenerate}
        title={`New QR code for ${confirming?.name ?? "this table"}?`}
        message={
          <>
            <strong>The QR card already printed for {confirming?.name ?? "this table"} stops working the moment you confirm</strong> —
            anyone scanning it will see “We could not find this table”. Print the new card and swap it on the table straight away.
            Guests already at the table stay signed in.
          </>
        }
        confirmLabel="Make new QR"
        confirmingLabel="Making…"
        isConfirming={regenerate.isPending}
        error={error}
      />
    </div>
  );
}
