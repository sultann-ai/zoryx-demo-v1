# Table QR security and money review

Reviewed 2026-11-20 against [CLAUDE.md](../CLAUDE.md) and [TABLE_QR_SPEC.md](./TABLE_QR_SPEC.md). Scope includes the public customer table routes, staff table/bill routes, print routes, Table QR socket events, POS floor/order screens, and the customer table/bill screens.

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `backend/src/modules/print/print.routes.ts` | 7-12 | `ORDER_TAKER` could submit arbitrary raw print documents, including a `drawer` block. Client-side screen restrictions were not an access-control boundary. | 9/10 |

### Finding 1 — arbitrary raw print access for ORDER_TAKER — fixed

The raw `POST /api/pos/print` endpoint accepts validated but caller-supplied documents. Its block vocabulary includes `drawer`, so an authenticated order taker could open the cash drawer or print arbitrary content. This was reachable even without using the Table QR screen.

The fix removes `ORDER_TAKER` from the raw print roles and adds `POST /api/pos/table-sessions/:id/receipt/print`. That endpoint:

- accepts only an optional `printerId`;
- loads the immutable receipt snapshot on the server;
- builds the print document on the server, with no caller-supplied blocks;
- restricts an order taker to sessions assigned to that waiter;
- preserves order-taker table receipt printing.

Regression coverage is in `backend/src/routes/tableQrRoutes.test.ts`: raw drawer printing is 403 for `ORDER_TAKER`, while the bound receipt route is allowed to reach its service-level response.

## Threat-by-threat results

| Threat case | Result |
|---|---|
| Screenshot QR used from home | No confirmed vulnerability. The QR key is only a table identifier; guest actions still require a seated session and, when enabled, the session PIN. The QR key is not a bearer guest token. |
| Reusing a token after close | Protected. Guest middleware rejects closed/voided sessions and revoked guests. The only post-close token path is the narrowly scoped receipt-key handoff. |
| Joining another table | Protected. Join resolves the QR key to the target table/session and stores a token hash tied to that session; a token from another session is not accepted. |
| Acting on another guest's share | Protected. Guest share actions derive identity from the table token rather than a submitted guest id. Staff share operations resolve the share under the requested session, and order-taker cash collection additionally checks the session waiter. |
| Price or amount tampering | Protected. Order prices and bill totals are recomputed server-side. Discount, paid amount, custom shares, and split inputs are validated as money values; share totals are computed and asserted server-side. |
| Replayed requests | Protected by the existing idempotency/replay handling for joins, bill writes, payment transitions, and conditional status updates. Replays return the already-applied result or a state error rather than applying money twice. |
| Bypassing limits | No confirmed bypass. Guest join, round, call, upload, line, quantity, body-size, and rate limits are enforced server-side before business work. |
| Split sums | Protected. EQUAL, BY_ITEMS, and CUSTOM are computed with Decimal arithmetic; CUSTOM requires the exact total and the service asserts the invariant after computation. |
| Two guests confirming a split simultaneously | Protected by the bill/session transaction locking and expected-version checks. One write wins; the other receives the bill-version or payment-state conflict and must refresh. |
| POS/customer reconnect gaps | No confirmed data-integrity vulnerability. Customer bill/session state is polling-based; POS floor/bill updates use socket invalidation plus query refetch/backstop behavior. Explicit missed-event/reconnect tests are still a coverage gap listed below. |

## Medium items left for follow-up

1. Add two-client HTTP tests for missed socket events and reconnect recovery on floor state, bill status, and close/receipt transitions.
2. Add explicit race tests for simultaneous split confirmation, claim/payment transitions, and replayed requests across separate clients.
3. Add HTTP-level tests for cross-session receipt/proof/share access and token reuse after close, rather than relying only on service-level coverage.

## Low items left for follow-up

1. Add a browser-level test proving an old printed QR screenshot remains read-only from an unseated/home context and cannot create a session.
2. Add a browser-level test for reconnecting both a POS floor screen and a customer bill screen after deliberately dropping socket/network events.

## Validation

- `npx vitest run src/routes/tableQrRoutes.test.ts` — passed, 11 tests.
- `npm test -- --maxWorkers=1 --testTimeout=15000` in `backend/` — passed, 52 files / 459 tests.
- `npm run build` in `pos-frontend/` — passed (includes TypeScript build).
- `npm run lint` in `pos-frontend/` — passed with existing repository warnings.
- `npm run build` in `backend/` — passed.

The default parallel `npm test` run exposed pre-existing local-DB/media timeout and transaction-isolation failures (8 tests); the serial, longer-timeout run above passed without code changes to those areas.
