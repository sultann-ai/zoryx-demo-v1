import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { forceLogout } from "../auth/session";

// A fresh connection per caller (not a shared singleton like the axios client) — only the Kitchen
// Display needs this today, and it should connect/disconnect with that page's own lifecycle rather
// than live for the whole app session.
//
// Auth problems log out exactly like an HTTP 401: a handshake the server refused because of the
// account (deactivated, role changed, bad or expired token — `data.code === "AUTH"`), or
// "auth:revoked", sent just before the server ends the sockets of an account that was just
// deactivated, deleted, re-roled or had its password reset. Other connection errors (server down,
// network) don't log anyone out; callers keep showing their own "disconnected" message.
export function connectSocket(token: string): Socket {
  const socket = io(import.meta.env.VITE_API_URL, { auth: { token } });
  socket.on("connect_error", (error: Error & { data?: { code?: string } }) => {
    if (error.data?.code === "AUTH") {
      socket.disconnect();
      forceLogout();
    }
  });
  socket.on("auth:revoked", () => {
    socket.disconnect();
    forceLogout();
  });
  return socket;
}
