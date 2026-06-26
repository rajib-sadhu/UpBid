import { io, type Socket } from "socket.io-client";
import { getToken } from "../lib/auth-storage.js";

// Single Socket.io connection for the whole app. Same-origin by default (dev
// proxies /socket.io to :4000; production serves both from one Node server). The
// auth callback runs on every (re)connect so a refreshed token is always sent.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      auth: (cb) => cb({ token: getToken() ?? "" }),
    });
  }
  return socket;
}
