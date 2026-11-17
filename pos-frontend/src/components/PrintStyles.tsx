// Shared by the print-only order views (receipt, kitchen tickets). Tuned for an 80mm
// thermal roll: @page sizes the physical paper so the browser's print driver doesn't
// scale/clip to A4, a monospace font keeps item/price columns aligned at small sizes,
// and dashed rules replace table borders (a thermal head renders a thin dash far more
// reliably than a solid 1px border, which can come out patchy).
export function PrintStyles() {
  return (
    <style>{`
      @page { size: 80mm auto; margin: 0; }
      body {
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
        line-height: 1.4;
        margin: 0;
        padding: 8px;
        width: 80mm;
        box-sizing: border-box;
      }
      h1 { font-size: 15px; margin: 0 0 4px; text-align: center; }
      p { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin: 6px 0; }
      th, td { text-align: left; padding: 2px 0; border-bottom: 1px dashed #000; }
      th:last-child, td:last-child { text-align: right; }
      .ticket { page-break-after: always; }
      .ticket:last-child { page-break-after: auto; }
      @media print {
        .no-print { display: none; }
      }
    `}</style>
  );
}
