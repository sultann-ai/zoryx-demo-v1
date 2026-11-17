import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../api/errors";
import type {
  DaySalesRow,
  ExportReportType,
  MonthSalesRow,
  SalesReportGroupBy,
  SalesReportParams,
} from "../api/reports";
import { reportsApi } from "../api/reports";
import { useCurrentBusinessDay } from "../hooks/useBusinessDay";
import { useSalesReport } from "../hooks/useSalesReport";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../components/ui";

function isDayRow(row: DaySalesRow | MonthSalesRow): row is DaySalesRow {
  return "businessDayId" in row;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function defaultFrom(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReportsPage() {
  const { data: currentBusinessDay } = useCurrentBusinessDay();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<SalesReportGroupBy>("day");
  const [queryParams, setQueryParams] = useState<SalesReportParams | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const { data: rows, isLoading, isError } = useSalesReport(queryParams);

  const [exportType, setExportType] = useState<ExportReportType>("daily");
  const [exportBusinessDayId, setExportBusinessDayId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Default the export field to the current business day once, without fighting
  // a later manual edit (same pattern as the Orders list's businessDayId filter).
  const hasInitializedExportBusinessDayId = useRef(false);
  useEffect(() => {
    if (!hasInitializedExportBusinessDayId.current && currentBusinessDay) {
      setExportBusinessDayId(currentBusinessDay.id);
      hasInitializedExportBusinessDayId.current = true;
    }
  }, [currentBusinessDay]);

  function handleQuerySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQueryError(null);
    if (to < from) {
      setQueryError('"To" date must not be before "From" date.');
      return;
    }
    setQueryParams({ from, to, groupBy });
  }

  async function handleExport() {
    if (exportBusinessDayId.trim() === "") {
      setExportError("Business day ID is required.");
      return;
    }
    setExportError(null);
    setIsExporting(true);
    try {
      const blob = await reportsApi.exportReport(exportType, exportBusinessDayId.trim());
      downloadBlob(blob, `${exportType}-report.xlsx`);
    } catch (error) {
      setExportError(getApiErrorMessage(error, "Failed to export report"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" />

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-section font-semibold text-ink">Sales report</h2>

        <Card>
          {/* Stacked and full-width on a phone, like every other form here; the
              same wrapping row as before from md up. */}
          <form onSubmit={handleQuerySubmit} className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reports-from" className="text-meta font-medium text-ink-muted">
                From
              </label>
              <Input id="reports-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reports-to" className="text-meta font-medium text-ink-muted">
                To
              </label>
              <Input id="reports-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reports-group-by" className="text-meta font-medium text-ink-muted">
                Group by
              </label>
              <Select
                id="reports-group-by"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as SalesReportGroupBy)}
              >
                <option value="day">Day</option>
                <option value="month">Month</option>
              </Select>
            </div>
            <FormActions className="md:contents">
              <Button type="submit" variant="primary">
                Run report
              </Button>
            </FormActions>
          </form>
          {queryError && (
            <p role="alert" className="mt-4 text-body text-status-danger-text">
              {queryError}
            </p>
          )}
        </Card>

        {isLoading && <p className="text-body text-ink-muted">Loading sales report…</p>}
        {isError && <p className="text-body text-status-danger-text">Could not load the sales report.</p>}

        {rows && rows.length === 0 && <EmptyState title="No sales in this range" description="Try a different date range." />}

        {rows && rows.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                {groupBy === "day" ? (
                  <>
                    <TableHeaderCell>Business day</TableHeaderCell>
                    <TableHeaderCell>Started</TableHeaderCell>
                    <TableHeaderCell>Ended</TableHeaderCell>
                    <TableHeaderCell>Orders</TableHeaderCell>
                    <TableHeaderCell>Total sales</TableHeaderCell>
                  </>
                ) : (
                  <>
                    <TableHeaderCell>Month</TableHeaderCell>
                    <TableHeaderCell>Business days</TableHeaderCell>
                    <TableHeaderCell>Orders</TableHeaderCell>
                    <TableHeaderCell>Total sales</TableHeaderCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) =>
                isDayRow(row) ? (
                  <TableRow key={row.businessDayId}>
                    <TableCell className="font-medium text-ink">{row.label}</TableCell>
                    <TableCell>{new Date(row.startedAt).toLocaleString()}</TableCell>
                    <TableCell>{row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-numeric">{row.orderCount}</TableCell>
                    <TableCell className="text-numeric">{Number(row.totalSales).toFixed(2)}</TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium text-ink">{row.month}</TableCell>
                    <TableCell className="text-numeric">{row.businessDayCount}</TableCell>
                    <TableCell className="text-numeric">{row.orderCount}</TableCell>
                    <TableCell className="text-numeric">{Number(row.totalSales).toFixed(2)}</TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-section font-semibold text-ink">Export</h2>
        <Card className="max-w-md">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="export-type" className="text-meta font-medium text-ink-muted">
                Type
              </label>
              <Select
                id="export-type"
                value={exportType}
                onChange={(event) => setExportType(event.target.value as ExportReportType)}
              >
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="export-business-day-id" className="text-meta font-medium text-ink-muted">
                Business day ID
              </label>
              <Input
                id="export-business-day-id"
                type="text"
                value={exportBusinessDayId}
                onChange={(event) => setExportBusinessDayId(event.target.value)}
              />
            </div>
            {exportType === "monthly" && (
              <p className="text-meta text-ink-muted">Exports the whole calendar month containing this business day.</p>
            )}
            {exportError && (
              <p role="alert" className="text-body text-status-danger-text">
                {exportError}
              </p>
            )}
            <div>
              <Button type="button" variant="secondary" onClick={handleExport} disabled={isExporting}>
                {isExporting ? "Exporting…" : "Export"}
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
