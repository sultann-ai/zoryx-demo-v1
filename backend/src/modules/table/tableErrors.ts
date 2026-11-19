// A refusal on the staff Table QR routes: an HTTP status, the code the POS branches on, and any extra
// fields for the body ({ error, code, ...extra }). Its own file so every table service can import it
// without a cycle.
export class TableStaffError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
