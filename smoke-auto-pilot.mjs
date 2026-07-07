// End-to-end smoke test for the AUTO-PILOT feature, against the real server +
// MySQL. Run from the repo root (socket.io-client is hoisted there):
//   node --env-file=.env smoke-auto-pilot.mjs
//
// It provisions an organizer → cricket league/season/4 franchises → auction with
// small squad caps and a player pool LARGER than total capacity, then hands the
// auction to the bot engine over Socket.io and asserts:
//   1. the run reaches COMPLETED,
//   2. every team meets the minimum squad size,
//   3. bidding actually happened AND some lots went genuinely UNSOLD (bots pass
//      on players they don't rate — value-driven passing),
//   4. AUTO_STOP mid-run freezes the bots immediately (no further bids) and a
//      subsequent AUTO_START resumes the same run to completion,
//   5. the engine did not need to open every lot (capacity < pool).
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
  // Credit 60 → par ≈ 10/slot for a 6-player squad, so budget-driven bidding
  // has real room without silly numbers.
  await api("PUT", `/api/auctions/${AID}/rules`, tok, {
    creditPerTeam: "60",
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
  // Mid-run we also exercise the Stop Auto freeze: after the 2nd lot opens we
  // emit AUTO_STOP, verify the bots fall silent (≤1 in-flight bid), then
  // AUTO_START again and let the same run continue to completion.
  const counts = { LOT_OPENED: 0, BID_ACCEPTED: 0, LOT_SOLD: 0, LOT_UNSOLD: 0, PLAYER_ASSIGNED: 0 };
  const stopTest = { stopped: false, restarted: false, frozeOk: false };
  const openedSections = []; // role section of each opened lot, in order
  const reauctionOpens = []; // requiredNextBid of lots opened in RE_AUCTION
  const sectionOf = (cl) =>
    cl.cricketRole === "BOWLER"
      ? cl.bowlingStyle === "SPINNER"
        ? "SPIN"
        : "PACE"
      : cl.cricketRole;
  const finished = await new Promise((resolve, reject) => {
    const sock = io(BASE, { auth: { token: tok }, transports: ["websocket"] });
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error("timed out waiting for AUTO_FINISHED (540s)"));
    }, 540_000);

    sock.on("connect", () => sock.emit("AUCTION_JOIN", { auctionId: AID }));
    let started = false;
    sock.on("STATE_SNAPSHOT", () => {
      if (!started) {
        started = true;
        sock.emit("AUTO_START", { auctionId: AID });
        console.log("  auto-pilot started; watching…");
      }
    });
    for (const ev of Object.keys(counts)) sock.on(ev, () => counts[ev]++);

    sock.on("LOT_OPENED", (ev) => {
      openedSections.push(sectionOf(ev.currentLot));
      if (ev.currentLot.round === "RE_AUCTION") reauctionOpens.push(ev.currentLot.requiredNextBid);
      if (counts.LOT_OPENED === 2 && !stopTest.stopped) {
        stopTest.stopped = true;
        sock.emit("AUTO_STOP", { auctionId: AID });
        console.log("  AUTO_STOP sent mid-lot; checking the freeze…");
      }
    });
    sock.on("AUTO_STOPPED", () => {
      const bidsAtStop = counts.BID_ACCEPTED;
      setTimeout(() => {
        // Frozen means silence: at most one in-flight bid may have landed.
        stopTest.frozeOk = counts.BID_ACCEPTED - bidsAtStop <= 1;
        stopTest.restarted = true;
        sock.emit("AUTO_START", { auctionId: AID });
        console.log(
          `  freeze held for 5s (${counts.BID_ACCEPTED - bidsAtStop} stray bids); restarting…`,
        );
      }, 5000);
    });

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
    counts.BID_ACCEPTED >= counts.LOT_SOLD * 2,
    `bidding was contested (${counts.BID_ACCEPTED} bids over ${counts.LOT_SOLD} sales — avg ${(counts.BID_ACCEPTED / Math.max(1, counts.LOT_SOLD)).toFixed(1)}/lot)`,
  );
  ok(
    counts.LOT_UNSOLD > 0,
    `bots pass on players they don't rate — ${counts.LOT_UNSOLD} lots went unsold naturally`,
  );
  ok(stopTest.stopped && stopTest.frozeOk, "AUTO_STOP froze the bots immediately");
  ok(stopTest.restarted, "AUTO_START resumed the run after the stop");
  ok(
    pending + counts.LOT_UNSOLD > 0 && counts.LOT_OPENED <= lots.length,
    `pool exceeded demand — ${pending} pending / ${counts.LOT_UNSOLD} unsold after ${counts.LOT_OPENED} opens`,
  );
  const firstFive = new Set(openedSections.slice(0, 5));
  ok(
    firstFive.size >= 4,
    `lots rotate role sections — first 5 opens covered ${firstFive.size} sections (${[...firstFive].join(", ")})`,
  );
  ok(
    reauctionOpens.length === 0 || reauctionOpens.every((p) => Number(p) === 0.5),
    `re-auction bidding starts at the unsold price (${reauctionOpens.length} lots opened @ ${reauctionOpens[0] ?? "n/a"})`,
  );

  const monitor = await api("GET", `/api/monitor/auctions/${AID}`, tok);
  const spends = monitor.teams.map((t) => Number(t.committedAmount) / 60);
  const avgSpend = spends.reduce((a, b) => a + b, 0) / spends.length;
  console.log(`  spend: ${spends.map((s) => `${Math.round(s * 100)}%`).join(" · ")}`);
  ok(
    avgSpend >= 0.5,
    `teams use their credit — average spend ${Math.round(avgSpend * 100)}% of 60`,
  );

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
