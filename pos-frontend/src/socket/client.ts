import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

// A fresh connection per caller (not a shared singleton like the axios client) —
// only the Kitchen Display needs this today, and it should connect/disconnect
// with that page's own lifecycle rather than live for the whole app session.
export function connectSocket(token: string): Socket {
  return io(import.meta.env.VITE_API_URL, { auth: { token } });
}
