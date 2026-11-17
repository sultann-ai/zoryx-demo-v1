// Shop identity used on the customer-facing receipt only — never on kitchen tickets, which
// stay as short as possible to save paper (see print/buildKitchenTicketDocs.ts).
// The receipt shows the one-color logo (lowercase wordmark), "DEMO", then the footer URL — no
// separate shop-name line, since the logo already says it.
export const shop = {
  name: "Zoryx",
  wordmark: "zoryx",
  footerUrl: "zoryx.dev",
  // Not supplied for the demo — set these to print a phone / address line on the receipt.
  phone: null as string | null,
  address: null as string | null,
  currencyLabel: "Rs",
  timeZone: "Asia/Karachi",
};
