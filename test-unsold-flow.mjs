// Functional test: unsold-auction sweep/chaining + one-live-auction-per-season.
// Run from repo root: node --env-file=.env test-unsold-flow.mjs
import { io } from "socket.io-client";

const BASE = "http://127.0.0.1:4000";
const TAG = `uns${Date.now().toString(36)}`;
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.error(`  ✗ ${m}`)));

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const { token: adminTok } = await api("POST", "/api/auth/login", null, {
  email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD,
});
await api("POST", "/api/users/organizers", adminTok, {
  email: `org-${TAG}@smoke.test`, name: "Unsold Tester", password: "password123",
});
const { token: tok } = await api("POST", "/api/auth/login", null, {
  email: `org-${TAG}@smoke.test`, password: "password123",
});

const league = await api("POST", "/api/leagues", tok, { name: `Unsold L ${TAG}`, shortName: "UNS", sport: "CRICKET" });
const season = await api("POST", `/api/leagues/${league.id}/seasons`, tok, { name: "US1", startDate: "2026-01-01", endDate: "2026-12-31" });
const codes = ["UNA", "UNB"];
const franchiseIds = [];
for (let i = 0; i < 2; i++) {
  const f = await api("POST", `/api/leagues/${league.id}/franchises`, tok, {
    name: `Unsold T${i + 1}`, shortName: codes[i], primaryColor: "#2563eb",
  });
  franchiseIds.push(f.id);
}
await api("PUT", `/api/seasons/${season.id}/franchises`, tok, { franchiseIds });

async function makeAuction(name, lotCount) {
  const a = await api("POST", `/api/seasons/${season.id}/auctions`, tok, { name, biddingMode: "ORGANIZER" });
  await api("PUT", `/api/auctions/${a.id}/rules`, tok, {
    creditPerTeam: "50", minPlayersPerTeam: 1, maxPlayersPerTeam: 10,
    unsoldPrice: "0.5", defaultBasePrice: "2", defaultLotDurationSec: 600,
  });
  await api("PUT", `/api/auctions/${a.id}/increment-tiers`, tok, { tiers: [{ fromAmount: "0", increment: "0.5" }] });
  const avail = await api("GET", `/api/auctions/${a.id}/available-players?pageSize=50`, tok);
  const lots = avail.data.slice(0, lotCount).map((p) => ({ playerId: p.id, basePrice: "2" }));
  await api("POST", `/api/auctions/${a.id}/lots`, tok, { lots });
  return a;
}

// --- Auction A live, then B goes live → A auto-suspends -------------------
const A = await makeAuction(`Unsold Main ${TAG}`, 4);
await api("POST", `/api/auctions/${A.id}/go-live`, tok);
const B = await makeAuction(`Unsold Rival ${TAG}`, 3);
await api("POST", `/api/auctions/${B.id}/go-live`, tok);
const aAfter = await api("GET", `/api/auctions/${A.id}`, tok);
ok(aAfter.status === "SUSPENDED", `going live on a second auction suspends the first (A is ${aAfter.status})`);

// --- Socket driver on B: sweep to unsold auction, verify price, chain -----
const sock = io(BASE, { auth: { token: tok }, transports: ["websocket"] });
const emit = (ev, payload) => sock.emit(ev, payload);
const once = (ev) => new Promise((r) => sock.once(ev, r));
const failTimer = setTimeout(() => { console.error("socket flow timed out"); process.exit(1); }, 30_000);

await new Promise((r) => sock.on("connect", r));
emit("AUCTION_JOIN", { auctionId: B.id });
await once("STATE_SNAPSHOT");

// Sweep with ALL 3 lots never opened → everything moves to the unsold round.
emit("PHASE_ADVANCE", { auctionId: B.id, to: "RE_AUCTION" });
await once("PHASE_CHANGED");
let lots = await api("GET", `/api/auctions/${B.id}/lots`, tok);
ok(
  lots.every((l) => l.status === "PENDING" && l.round === "RE_AUCTION"),
  "sweep: never-opened players all moved into the unsold auction",
);

// Open one lot — bidding must start at the unsold price (0.5), not base (2).
emit("LOT_OPEN", { auctionId: B.id, auctionPlayerId: lots[0].id });
const opened = await once("LOT_OPENED");
ok(opened.currentLot.requiredNextBid === "0.50", `unsold auction opens at 0.50 (got ${opened.currentLot.requiredNextBid})`);

// Sell it to a team at the unsold price, mark the second unsold.
const snapB = await new Promise((r) => { sock.once("STATE_SNAPSHOT", r); emit("AUCTION_JOIN", { auctionId: B.id }); });
const teamId = snapB.teams[0].id;
emit("BID_PLACE", {
  auctionId: B.id, auctionPlayerId: lots[0].id, teamId,
  amount: "0.50", version: opened.currentLot.version, clientBidId: `${TAG}-b1`,
});
await once("BID_ACCEPTED");
emit("LOT_SELL", { auctionId: B.id, auctionPlayerId: lots[0].id });
const soldEv = await once("LOT_SOLD");
ok(soldEv.lot.soldPrice === "0.50", `sold in the unsold auction at 0.50 (got ${soldEv.lot.soldPrice})`);

emit("LOT_OPEN", { auctionId: B.id, auctionPlayerId: lots[1].id });
await once("LOT_OPENED");
emit("LOT_MARK_UNSOLD", { auctionId: B.id, auctionPlayerId: lots[1].id });
await once("LOT_UNSOLD");

// Chain: run ANOTHER unsold auction from the unsold round.
emit("PHASE_ADVANCE", { auctionId: B.id, to: "RE_AUCTION" });
await once("PHASE_CHANGED");
lots = await api("GET", `/api/auctions/${B.id}/lots`, tok);
const stillPending = lots.filter((l) => l.status === "PENDING");
ok(
  stillPending.length === 2 && stillPending.every((l) => l.round === "RE_AUCTION"),
  "chaining: a second unsold auction re-sweeps the leftovers",
);
ok(lots.some((l) => l.status === "SOLD"), "the earlier unsold-auction sale is untouched by the chain");

// --- End this auction: remaining players are recorded UNSOLD ---------------
emit("PHASE_ADVANCE", { auctionId: B.id, to: "ASSIGNMENT" });
const phaseEv = await once("PHASE_CHANGED");
// Pick rotation: teams[0] bought a player earlier, the other team has none →
// the other team (most free slots) is first in the queue.
const buyer = snapB.teams[0];
const other = snapB.teams[1];
ok(
  phaseEv.assignment?.pickQueue?.[0] === other.id,
  "pick rotation: the team with the most free slots picks first",
);

// Organizer skips the leading team out of the rotation, then puts it back.
emit("ASSIGN_SKIP", { auctionId: B.id, teamId: other.id });
const turnEv = await once("ASSIGN_TURN");
ok(
  turnEv.assignment.skipped.includes(other.id) && turnEv.assignment.pickQueue[0] === buyer.id,
  "skipping a team hands the turn to the next one",
);
emit("ASSIGN_SKIP", { auctionId: B.id, teamId: other.id });
await once("ASSIGN_TURN");

// Team 2 is below the minimum of 1 — assign it one player so the end gate passes.
const team2 = other.id;
emit("ASSIGN_PLAYER", { auctionId: B.id, auctionPlayerId: stillPending[0].id, teamId: team2 });
const assignedEv = await once("PLAYER_ASSIGNED");
ok(
  assignedEv.assignment.pickQueue[0] === buyer.id,
  "a pick consumes the team's turn — the other team is up next",
);
emit("PHASE_ADVANCE", { auctionId: B.id, to: "COMPLETED" });
await once("PHASE_CHANGED");
lots = await api("GET", `/api/auctions/${B.id}/lots`, tok);
const leftover = lots.find((l) => l.id === stillPending[1].id);
ok(
  leftover?.status === "UNSOLD",
  `ending the auction records remaining players as UNSOLD in the DB (got ${leftover?.status})`,
);
ok(
  lots.every((l) => l.status !== "PENDING"),
  "no lot is left PENDING after the auction ends",
);

// --- Incomplete lineups cannot be saved -------------------------------------
const monRes = await fetch(`${BASE}/api/monitor/auctions/${B.id}`, {
  headers: { authorization: `Bearer ${tok}` },
});
const mon = await monRes.json();
const t1 = mon.teams.find((t) => t.squad.length > 0);
const saveRes = await fetch(`${BASE}/api/teams/${t1.id}/lineup`, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
  body: JSON.stringify({
    members: [
      {
        teamPlayerId: t1.squad[0].teamPlayerId,
        membership: "STARTER",
        battingOrder: 1,
        isWicketkeeper: false, isFirstBowler: false, isSecondBowler: false,
        isCaptain: false, isViceCaptain: false,
      },
    ],
  }),
});
const saveBody = await saveRes.json();
ok(
  saveRes.status === 409 && saveBody.code === "INCOMPLETE_LINEUP",
  `incomplete lineup save is rejected (${saveRes.status} ${saveBody.code})`,
);
ok(
  Array.isArray(saveBody.details) && saveBody.details.length > 0,
  `rejection lists what's missing (${saveBody.details?.length ?? 0} violations)`,
);

clearTimeout(failTimer);
sock.close();

// --- Cleanup ---------------------------------------------------------------
await api("DELETE", `/api/auctions/${B.id}`, tok).catch(() => {});
// A is SUSPENDED — cancel then delete is not supported; delete works on any status? try:
await api("DELETE", `/api/auctions/${A.id}`, tok).catch((e) => console.log("  note:", e.message));
await api("DELETE", `/api/seasons/${season.id}`, tok);
for (const fid of franchiseIds) await api("DELETE", `/api/leagues/${league.id}/franchises/${fid}`, tok).catch(() => {});
await api("DELETE", `/api/leagues/${league.id}`, tok);

console.log(`\n== unsold-flow test: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
