// The table QR cards' print stylesheet (pages/QrSheetPage.tsx), the same pattern as PrintStyles for
// receipts: a plain <style> with @page sizing the real paper, so the browser neither scales nor clips.
// Every size is in mm so the screen preview is the printed card. Colours are the brand variables from
// index.css; print-color-adjust keeps the green band when "Background graphics" is off.
//
// - "a4": an A4 portrait sheet holding 6 cards (2 x 3), each about 92 x 89 mm (QR 38 mm), with dashed cut lines.
// - "tent": one 10 x 15 cm card per page (QR 62 mm), for table tents / photo-size card stock.
export type QrLayout = "a4" | "tent";

const PAGE = {
  a4: "@page { size: A4 portrait; margin: 0; }",
  tent: "@page { size: 100mm 150mm; margin: 0; }",
};

export function QrCardStyles({ layout }: { layout: QrLayout }) {
  return (
    <style>{`
      ${PAGE[layout]}
      .qr-pages { display: flex; flex-direction: column; align-items: center; gap: 8mm; padding: 8mm 0; }
      .qr-page {
        background: #fff;
        box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .qr-page-a4 {
        width: 210mm; height: 297mm; padding: 10mm;
        display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(3, 1fr); gap: 5mm;
      }
      .qr-page-tent { width: 100mm; height: 150mm; padding: 5mm; display: flex; }

      .qr-card {
        position: relative; box-sizing: border-box; overflow: hidden;
        display: flex; flex-direction: column; align-items: center; text-align: center;
        background: var(--color-brand-cream); color: var(--color-ink);
        border-radius: 4mm;
      }
      .qr-page-a4 .qr-card { outline: 0.3mm dashed var(--color-ink-muted); outline-offset: 2mm; }
      .qr-page-tent .qr-card { flex: 1; }
      .qr-band {
        width: 100%; display: flex; align-items: center; justify-content: center;
        background: var(--color-brand-forest);
      }
      .qr-name { font-family: var(--font-heading); font-weight: 800; line-height: 1.05; margin: 0; }
      .qr-area { font-family: var(--font-body); color: var(--color-ink-muted); margin: 0; }
      .qr-code { background: #fff; border-radius: 2mm; display: block; }
      .qr-code path { fill: var(--color-ink); }
      .qr-ur {
        font-family: "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", serif;
        line-height: 1.9; margin: 0; font-weight: 400;
      }
      .qr-en { font-family: var(--font-body); font-weight: 700; margin: 0; }

      .qr-page-a4 .qr-band { height: 15mm; }
      .qr-page-a4 .qr-name { font-size: 6.5mm; margin-top: 2.5mm; }
      .qr-page-a4 .qr-area { font-size: 3.2mm; }
      .qr-page-a4 .qr-code { width: 38mm; height: 38mm; margin-top: 2mm; }
      .qr-page-a4 .qr-ur { font-size: 4mm; margin-top: 1.5mm; }
      .qr-page-a4 .qr-en { font-size: 3.4mm; }

      .qr-page-tent .qr-band { height: 22mm; }
      .qr-page-tent .qr-name { font-size: 10mm; margin-top: 5mm; }
      .qr-page-tent .qr-area { font-size: 4.2mm; }
      .qr-page-tent .qr-code { width: 62mm; height: 62mm; margin-top: 4mm; }
      .qr-page-tent .qr-ur { font-size: 5.4mm; margin-top: 3mm; }
      .qr-page-tent .qr-en { font-size: 4.4mm; }

      @media print {
        html, body { background: #fff !important; margin: 0; padding: 0; }
        .no-print { display: none !important; }
        .qr-pages { display: block; padding: 0; }
        .qr-page { box-shadow: none; break-after: page; page-break-after: always; }
        .qr-page:last-child { break-after: auto; page-break-after: auto; }
      }
    `}</style>
  );
}
