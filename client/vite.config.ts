import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Don't inline flag-icons SVGs into the CSS — emit them as files so only the
    // flags actually displayed are fetched (keeps the CSS bundle small). Other
    // assets keep Vite's default inlining behavior.
    assetsInlineLimit: (filePath) => (filePath.includes("flag-icons") ? false : undefined),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the Express server in dev (avoids CORS juggling).
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Proxy uploaded files (player photos, etc.) to the API server so relative
      // /uploads paths resolve same-origin in dev, just like /api.
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Proxy the Socket.io endpoint (incl. WebSocket upgrade) to the API server
      // so the client connects same-origin in dev and in production alike.
      "/socket.io": {
        target: "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
