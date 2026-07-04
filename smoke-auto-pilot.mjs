// End-to-end smoke test for the AUTO-PILOT feature, against the real server +
// MySQL. Run from the repo root (socket.io-client is hoisted there):
//   node --env-file=.env smoke-auto-pilot.mjs
//
// It provisions an organizer → cricket league/season/4 franchises → auction with
// small squad caps and a player pool LARGER than total capacity, then hands the
// auction to the bot engine over Socket.io and asserts:
//   1. the run reaches COMPLETED,
//   2. every team meets the minimum squad size,
//   3. the all-full short-circuit fired (PENDING lots remain un-opened) — i.e. the
//      engine did NOT grind every remaining lot as unsold once squads were full,
//   4. bidding actually happened and some lots went unsold/left (natural).
// Cleans up everything it created at the end.

import { io } from "socket.io-client";

const BASE = "http://127.0.0.1:4000";
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };
const TAG = `smk${Date.now().toString(36)}`;

let pass = 0;
let fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.error(`  ✗ ${m}`)));

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n== auto-pilot smoke (${TAG}) ==`);

  // --- Auth: admin, then a fresh organizer --------------------------------
  const { token: adminTok } = await api("POST", "/api/auth/login", null, ADMIN);
  const orgEmail = `org-${TAG}@smoke.test`;
  await api("POST", "/api/users/organizers", adminTok, {
    email: orgEmail,
    name: "Smoke Organizer",
    password: "password123",
  });
  const { token: tok } = await api("POST", "/api/auth/login", null, {
    email: orgEmail,
    password: "password123",
  });

  // --- League / season / franchises ---------------------------------------
  const league = await api("POST", "/api/leagues", tok, {
    name: `Smoke League ${TAG}`,
    shortName: "SMK",
    sport: "CRICKET",
  });
  const season = await api("POST", `/api/leagues/${league.id}/seasons`, tok, {
    name: "Smoke S1",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  const colors = ["#e11d48", "#2563eb", "#16a34a", "#d97706"];
  const codes = ["SMA", "SMB", "SMC", "SMD"];
  const franchiseIds = [];
  for (let i = 0; i < 4; i++) {
    const f = await api("POST", `/api/leagues/${league.id}/franchises`, tok, {
      name: `Smoke Team ${i + 1}`,
      shortName: codes[i],
      primaryColor: colors[i],
    });
    franchiseIds.push(f.id);
  }
  await api("PUT", `/api/seasons/${season.id}/franchises`, tok, { franchiseIds });

  // --- Auction + rules + tiers + cricket squad targets --------------------
  const auction = await api("POST", `/api/seasons/${season.id}/auctions`, tok, {
    name: `Smoke Auction ${TAG}`,
    biddingMode: "FRANCHISE",
  });
  const AID = auction.id;
  const MIN = 5;
  const MAX = 6; // tight cap so 4 teams (24 slots) fill up before the pool drains
  await api("PUT", `/api/auctions/${AID}/rules`, tok, {
    creditPerTeam: "200",
    minPlayersPerTeam: MIN,
    maxPlayersPerTeam: MAX,
    unsoldPrice: "0.5",
    defaultBasePrice: "2",
    defaultLotDurationSec: 600,
  });
  // Tiered increments — the price jumps grow at higher values, so hot lots
  // resolve in a handful of bids instead of dozens of tiny raises.
  await api("PUT", `/api/auctions/${AID}/increment-tiers`, tok, {
    tiers: [
      { fromAmount: "0", increment: "0.5" },
      { fromAmount: "4", increment: "1" },
      { fromAmount: "8", increment: "2" },
      { fromAmount: "16", increment: "5" },
    ],
  });
  await api("PUT", `/api/auctions/${AID}/cricket-squad-targets`, tok, {
    minWicketkeepers: 1,
    minBatsmen: 2,
    minOpeners: 1,
    minPaceBowlers: 1,
    minSpinners: 1,
    minAllRounders: 1,
  });

  // --- Lot list: a balanced pool LARGER than 4×MAX = 32 capacity ----------
  const avail = await api(
    "GET",
    `/api/auctions/${AID}/available-players?pageSize=100`,
    tok,
  );
  const pool = avail.data;
  const isPace = (p) => p.cricketRole === "BOWLER" && p.bowlingStyle !== "SPINNER";
  const isSpin = (p) => p.cricketRole === "BOWLER" && p.bowlingStyle === "SPINNER";
  const take = (pred, n) => pool.filter(pred).slice(0, n);
  const chosen = [
    ...take((p) => p.cricketRole === "WICKETKEEPER", 5),
    ...take((p) => p.cricketRole === "BATSMAN", 9),
    ...take(isPace, 7),
    ...take(isSpin, 4),
    ...take((p) => p.cricketRole === "ALL_ROUNDER", 5),
  ];
  const lots = chosen.map((p) => ({ playerId: p.id, basePrice: "2" }));
  await api("POST", `/api/auctions/${AID}/lots`, tok, { lots });
  console.log(`  setup: 4 teams, min ${MIN}/max ${MAX}, ${lots.length} lots (capacity ${4 * MAX})`);

  await api("POST", `/api/auctions/${AID}/go-live`, tok);

  // --- Drive the auto-pilot over Socket.io --------------------------------
  const counts = { LOT_OPENED: 0, BID_ACCEPTED: 0, LOT_SOLD: 0, LOT_UNSOLD: 0, PLAYER_ASSIGNED: 0 };
  const finished = await new Promise((resolve, reject) => {
    const sock = io(BASE, { auth: { token: tok }, transports: ["websocket"] });
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error("timed out waiting for AUTO_FINISHED (420s)"));
    }, 420_000);

    sock.on("connect", () => sock.emit("AUCTION_JOIN", { auctionId: AID }));
    let started = false;
    sock.on("STATE_SNAPSHOT", (snap) => {
      if (!started) {
        started = true;
        sock.emit("AUTO_START", { auctionId: AID });
        console.log("  auto-pilot started; watching…");
      }
    });
    for (const ev of Object.keys(counts)) sock.on(ev, () => counts[ev]++);
    sock.on("AUTO_FINISHED", (rep) => {
      clearTimeout(timer);
      sock.close();
      resolve(rep);
    });
    sock.on("ERROR", (e) => console.error("  socket ERROR:", e));
  });

  await sleep(300);

  // --- Assertions ---------------------------------------------------------
  console.log(
    `  events: ${counts.LOT_OPENED} opened · ${counts.BID_ACCEPTED} bids · ` +
      `${counts.LOT_SOLD} sold · ${counts.LOT_UNSOLD} unsold · ${counts.PLAYER_ASSIGNED} assigned`,
  );
  const finalLots = await api("GET", `/api/auctions/${AID}/lots`, tok);
  const pending = finalLots.filter((l) => l.status === "PENDING").length;

  console.log("  report:");
  for (const t of finished.report) {
    const short = t.roles.filter((r) => r.short > 0).map((r) => `${r.role}-${r.short}`);
    console.log(
      `    ${t.teamName}: ${t.playerCount} players, min ${t.minPlayersMet ? "OK" : "MISSED"}` +
        (short.length ? ` · short: ${short.join(", ")}` : " · all roles met"),
    );
  }

  console.log("\n  assertions:");
  ok(finished.completed === true, "auction reached COMPLETED");
  ok(
    finished.report.every((t) => t.minPlayersMet),
    `every team met the minimum of ${MIN}`,
  );
  ok(
    finished.report.every((t) => t.playerCount <= MAX),
    `no team exceeded the max of ${MAX}`,
  );
  ok(counts.BID_ACCEPTED > 0, "bots actually bid (BID_ACCEPTED > 0)");
  ok(
    pending > 0,
    `all-full short-circuit fired — ${pending} lots left un-opened (not ground out as unsold)`,
  );
  ok(counts.LOT_OPENED < lots.length, `did not open all ${lots.length} lots (${counts.LOT_OPENED})`);

  // --- Cleanup ------------------------------------------------------------
  try {
    await api("DELETE", `/api/auctions/${AID}`, tok);
    await api("DELETE", `/api/seasons/${season.id}`, tok);
    for (const fid of franchiseIds) {
      await api("DELETE", `/api/leagues/${league.id}/franchises/${fid}`, tok).catch(() => {});
    }
    await api("DELETE", `/api/leagues/${league.id}`, tok);
    console.log("\n  cleanup: removed auction/season/franchises/league");
  } catch (e) {
    console.error("\n  cleanup warning:", e.message);
  }

  console.log(`\n== result: ${pass} passed, ${fail} failed ==\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSMOKE FAILED:", e);
  process.exit(1);
});
