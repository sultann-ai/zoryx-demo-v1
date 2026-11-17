# Print protocol

Shared shape for a print job that flows: frontend (builds the doc) → backend (relays it, never
inspects its content beyond validation) → print agent (renders it to a physical ESC/POS printer).

A TypeScript copy of the types below lives in three places — each file starts with a comment
pointing back here and naming the other two. Keep all three in sync by hand; there is no shared
npm package. If they drift, the failure mode is a 400 at request time (the backend's hand-written
validator in `print.service.ts` is the real enforcement boundary, not the TS types), not a silent
bug.

- `backend/src/modules/print/printProtocol.ts`
- `pos-frontend/src/print/printProtocol.ts`
- `print-agent/src/printProtocol.ts`

## Shapes

```ts
interface PrintJob {
  jobId: string; // uuid
  printerId: string;
  doc: PrintDoc;
}

interface PrintDoc {
  blocks: Block[];
}

type Block =
  | { t: "text"; text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 | 3 }
  // size: 1 normal, 2 double height, 3 double width and height.
  // The agent word-wraps a text block that doesn't fit the paper (PRINTER_WIDTH_CHARS, half
  // that at size 3), never mid-word unless one word is wider than a line. A continuation line
  // keeps the original leading spaces; for left-aligned text it gets 2 more as a hanging
  // indent. Builders can send one long line per logical line and let the agent fit it.
  | { t: "row"; left: string; right: string; bold?: boolean }
  // left and right on one line; if left is too long it wraps onto extra lines, right stays on
  // the first line only
  | { t: "rule"; style?: "dash" | "double" }
  | { t: "feed"; lines: number }
  | { t: "cut" }
  | { t: "drawer" }; // kick the cash drawer
```

## Limits

Enforced by the backend's `print.service.ts` validator, not just documented here:

- Max 300 blocks per doc.
- Max 200 characters per text field (`text`, `row.left`, `row.right`).
- Max 10 docs per `POST /api/pos/print` request.

## Transport: `POST /api/pos/print`

```
POST /api/pos/print
Authorization: Bearer <staff token>
{ "printerId"?: "main", "docs": PrintDoc[] }
```

- `200 { printed: n }` — every doc sent and acked.
- `503 { error: "Printer agent is offline" }` — no agent connected for `printerId`.
- `502 { error: "<agent's message>" }` — the agent reported a failure on doc `n`; nothing after it
  was attempted.
- `504 { error: "Printer did not respond" }` — the agent didn't ack within 8 seconds on doc `n`.

`GET /api/pos/print/status?printerId=main` → `{ online: boolean }`.

## The ack contract — read this before touching the Socket.io code

The backend dispatches each doc as `socket.timeout(8000).emitWithAck("print:job", { jobId,
printerId, doc })` on the agent's own socket (never a room broadcast — exactly one agent is ever
registered per `printerId`, see `config/socket.ts`).

**Once `.timeout()` is used, Socket.io's ack callback switches to Node-style error-first
semantics**: whatever the agent passes as the *first* argument to its ack callback is always
treated as an error if it's truthy, regardless of what it contains. This means the ack must NOT be
a single `{ ok: true }`-style object — a truthy object as the first arg is read as a failure even
when it means success. (An earlier draft of this doc described exactly that broken shape; this is
the corrected version.)

The agent must call back like this:

- **Success**: `callback(null, { printed: true })` — explicit `null` first argument.
- **Failure**: `callback({ message: "<reason>" })` or `callback("<reason>")` — any truthy first
  argument.

On the backend side this collapses to a single `try`/`catch` around the `emitWithAck` call — there
is no `.ok` field to branch on:

```ts
try {
  await socket.timeout(8000).emitWithAck("print:job", { jobId, printerId, doc });
  // success
} catch (err) {
  // A disconnect mid-wait does NOT reject early — only the 8s timer does, so every rejection
  // here is either that timer or the agent's own reported failure.
  if (err instanceof Error && err.message === "operation has timed out") {
    // 504
  } else {
    // 502 — stringify defensively; the agent authenticates via a shared secret, not a staff
    // JWT, so don't trust its error shape blindly.
  }
}
```

The agent acking twice for the same `jobId` (e.g. a retried request after a timeout that actually
got through) must not double-print — see `print-agent/src/recentJobs.ts`'s 2-minute dedupe window.
