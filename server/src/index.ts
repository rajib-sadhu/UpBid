import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketServer } from "socket.io";
import { env } from "./env.js";
import { initGateway } from "./realtime/gateway.js";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/users.routes.js";
import leagueRoutes from "./modules/leagues/leagues.routes.js";
import seasonRoutes from "./modules/seasons/seasons.routes.js";
import playerRoutes from "./modules/players/players.routes.js";
import auctionRoutes from "./modules/auctions/auctions.routes.js";
import formationRoutes from "./modules/auctions/formations.routes.js";
import lineupRoutes from "./modules/lineups/lineups.routes.js";
import monitorRoutes from "./modules/monitor/monitor.routes.js";
import { errorHandler } from "./middleware/error.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// Behind one reverse proxy (Nginx) in production — required for correct client IPs
// (rate limiting) and secure-cookie/proto handling.
app.set("trust proxy", 1);

// Security headers (also strips the X-Powered-By banner). CSP is disabled for now
// because the SPA is served same-origin; add a tested policy in the deploy phase.
// CORP is set to cross-origin so the client (different origin in dev) can embed
// uploaded images served from this server.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(cors({ origin: env.clientOrigins, credentials: true }));
app.use(express.json());

// User-uploaded files (player photos, team logos) served statically.
app.use("/uploads", express.static(env.uploadDir));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "sports-auction-platform" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/leagues", leagueRoutes);
app.use("/api/seasons", seasonRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/auctions", auctionRoutes);
app.use("/api/formations", formationRoutes);
app.use("/api/teams", lineupRoutes);
app.use("/api/monitor", monitorRoutes);

// Unknown API route → JSON 404. Must precede the SPA catch-all below so that
// `/api/*` never falls through to index.html (which would return HTML 200).
app.use("/api", (_req, res) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
});

// Central error renderer — must be registered after API routes.
app.use(errorHandler);

// In production, serve the built client SPA and fall back to index.html for
// client-side routing. In dev, Vite's dev server handles this.
const clientDist = resolve(__dirname, "../../client/dist");
if (env.nodeEnv === "production" && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(resolve(clientDist, "index.html"));
  });
}

const httpServer = createServer(app);

// Socket.io — live auction gateway (auth handshake, rooms, bid pipeline, timer,
// state machine). See server/src/realtime and docs/architecture.md.
const io = new SocketServer(httpServer, {
  cors: { origin: env.clientOrigins, credentials: true },
});
initGateway(io);

httpServer.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});
