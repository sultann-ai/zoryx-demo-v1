import type { Analytics } from "../../api/analytics";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../components/ui";
import { formatInt, formatRs } from "./format";

// Discounts on the period's sales, per staff member who gave them. "Not recorded" is a discount set
// before attribution was kept.
export function DiscountsTable({ analytics }: { analytics: Analytics }) {
  const { discounts } = analytics;
  if (discounts.count === 0) {
    return <p className="text-body text-ink-muted">No discounts given in this period.</p>;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Staff</TableHeaderCell>
          <TableHeaderCell className="text-right">Orders</TableHeaderCell>
          <TableHeaderCell className="text-right">Discount</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {discounts.byStaff.map((row) => (
          <TableRow key={row.staffId ?? "not-recorded"}>
            <TableCell className={row.staffId ? "font-medium text-ink" : "text-ink-muted"}>{row.name}</TableCell>
            <TableCell className="text-right text-numeric">{formatInt(row.count)}</TableCell>
            <TableCell className="text-right text-numeric">{formatRs(row.amount)}</TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-semibold text-ink">Total</TableCell>
          <TableCell className="text-right text-numeric font-semibold">{formatInt(discounts.count)}</TableCell>
          <TableCell className="text-right text-numeric font-semibold">{formatRs(discounts.total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
