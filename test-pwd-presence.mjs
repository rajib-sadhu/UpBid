// Functional test: forced password change + connection presence bars.
// Run from repo root: node --env-file=.env test-pwd-presence.mjs
import { io } from "socket.io-client";

const BASE = "http://127.0.0.1:4000";
const TAG = `pp${Date.now().toString(36)}`;
let pass = 0, fail = 0;
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.error(`  ✗ ${m}`)));

async function api(method, path, token, body, expectOk = true) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (expectOk && !res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return { status: res.status, body: json };
}

const { body: adminLogin } = await api("POST", "/api/auth/login", null, {
  email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD,
});
const adminTok = adminLogin.token;

// --- Forced password change on provisioned accounts -------------------------
const orgEmail = `org-${TAG}@smoke.test`;
const { body: created } = await api("POST", "/api/users/organizers", adminTok, {
  email: orgEmail, name: "Pwd Tester", password: "initial-pass-1",
});
ok(created.mustChangePassword === true, "a provisioned account is created with mustChangePassword=true");

let { body: orgLogin } = await api("POST", "/api/auth/login", null, {
  email: orgEmail, password: "initial-pass-1",
});
ok(orgLogin.user.mustChangePassword === true, "login response carries the forced-change flag");

const bad = await api("POST", "/api/auth/change-password", orgLogin.token, {
  currentPassword: "wrong-pass-99", newPassword: "my-own-pass-1",
}, false);
ok(bad.status === 401, `change-password rejects a wrong current password (${bad.status})`);

const same = await api("POST", "/api/auth/change-password", orgLogin.token, {
  currentPassword: "initial-pass-1", newPassword: "initial-pass-1",
}, false);
ok(same.status === 400 || same.status === 422, `new password must differ from the current one (${same.status})`);

const { body: changed } = await api("POST", "/api/auth/change-password", orgLogin.token, {
  currentPassword: "initial-pass-1", newPassword: "my-own-pass-1",
});
ok(changed.user.mustChangePassword === false, "a successful change clears the flag");
const me = await api("GET", "/api/auth/me", changed.token);
ok(me.body.mustChangePassword === false, "the returned fresh token works and /me agrees");

const oldPw = await api("POST", "/api/auth/login", null, { email: orgEmail, password: "initial-pass-1" }, false);
ok(oldPw.status === 401, "the provisioned password no longer logs in");

// Reset by the creator → flag trips again on next login.
await api("POST", `/api/users/${created.id}/reset-password`, adminTok, { password: "reset-by-admin-1" });
({ body: orgLogin } = await api("POST", "/api/auth/login", null, {
  email: orgEmail, password: "reset-by-admin-1",
}));
ok(orgLogin.user.mustChangePassword === true, "a creator reset forces a change again on next login");
// Settle it so the organizer can drive the presence part unimpeded.
({ body: orgLogin } = await api("POST", "/api/auth/change-password", orgLogin.token, {
  currentPassword: "reset-by-admin-1", newPassword: "my-own-pass-2",
}));
const orgTok = orgLogin.token;

// --- Presence: connection bars data ------------------------------------------
// Minimal live auction with one franchise-owned team.
const { body: fUser } = await api("POST", "/api/users/franchises", orgTok, {
  email: `fr-${TAG}@smoke.test`, name: "Presence Owner", password: "franchise-pass-1",
});
let { body: frLogin } = await api("POST", "/api/auth/login", null, {
  email: `fr-${TAG}@smoke.test`, password: "franchise-pass-1",
});
({ body: frLogin } = await api("POST", "/api/auth/change-password", frLogin.token, {
  currentPassword: "franchise-pass-1", newPassword: "franchise-pass-2",
}));
const frTok = frLogin.token;

const { body: league } = await api("POST", "/api/leagues", orgTok, {
  name: `Presence L ${TAG}`, shortName: "PRE", sport: "CRICKET",
});
const { body: season } = await api("POST", `/api/leagues/${league.id}/seasons`, orgTok, {
  name: "P1", startDate: "2026-01-01", endDate: "2026-12-31",
});
const { body: fr } = await api("POST", `/api/leagues/${league.id}/franchises`, orgTok, {
  name: "Presence T1", shortName: "PRA", primaryColor: "#2563eb", ownerUserId: fUser.id,
});
const { body: fr2 } = await api("POST", `/api/leagues/${league.id}/franchises`, orgTok, {
  name: "Presence T2", shortName: "PRB", primaryColor: "#dc2626",
});
await api("PUT", `/api/seasons/${season.id}/franchises`, orgTok, { franchiseIds: [fr.id, fr2.id] });
const { body: auction } = await api("POST", `/api/seasons/${season.id}/auctions`, orgTok, {
  name: `Presence A ${TAG}`, biddingMode: "ORGANIZER",
});
await api("PUT", `/api/auctions/${auction.id}/rules`, orgTok, {
  creditPerTeam: "50", minPlayersPerTeam: 1, maxPlayersPerTeam: 5,
  unsoldPrice: "0.5", defaultBasePrice: "2", defaultLotDurationSec: 600,
});
await api("PUT", `/api/auctions/${auction.id}/increment-tiers`, orgTok, {
  tiers: [{ fromAmount: "0", increment: "0.5" }],
});
const { body: avail } = await api("GET", `/api/auctions/${auction.id}/available-players?pageSize=5`, orgTok);
await api("POST", `/api/auctions/${auction.id}/lots`, orgTok, {
  lots: [{ playerId: avail.data[0].id, basePrice: "2" }],
});
await api("POST", `/api/auctions/${auction.id}/go-live`, orgTok);

const failTimer = setTimeout(() => { console.error("presence flow timed out"); process.exit(1); }, 40_000);

function connect(token) {
  const s = io(BASE, { auth: { token }, transports: ["websocket"] });
  // Same responsibility the browser client has: ack the quality probe.
  s.on("PRESENCE_PING", (ack) => { if (typeof ack === "function") ack(); });
  return s;
}
const orgSock = connect(orgTok);
const frSock = connect(frTok);
await Promise.all([
  new Promise((r) => orgSock.on("connect", r)),
  new Promise((r) => frSock.on("connect", r)),
]);
let frGotPresence = false;
frSock.on("PRESENCE", () => { frGotPresence = true; });

orgSock.emit("AUCTION_JOIN", { auctionId: auction.id });
frSock.emit("AUCTION_JOIN", { auctionId: auction.id });
await new Promise((r) => orgSock.once("STATE_SNAPSHOT", r));

// Two ticks: the first reports pre-ping state, the second carries measured RTTs.
const presence = await new Promise((resolve) => {
  const seen = [];
  orgSock.on("PRESENCE", (ev) => {
    seen.push(ev);
    if (ev.users[fUser.id] !== undefined && ev.users[fUser.id] !== null) resolve(ev);
    else if (seen.length >= 4) resolve(ev); // give up gracefully after ~20s
  });
});
ok(fUser.id in presence.users, "organizer receives the franchise owner in the presence report");
ok(
  typeof presence.users[fUser.id] === "number" && presence.users[fUser.id] >= 0,
  `franchise RTT is measured (${presence.users[fUser.id]}ms)`,
);
ok(!frGotPresence, "the franchise socket receives no presence reports (organizer-only)");

// Monitor endpoint mirrors it for canManage, hides it otherwise.
const monOrg = await api("GET", `/api/monitor/auctions/${auction.id}`, orgTok);
ok(
  monOrg.body.presence && fUser.id in monOrg.body.presence,
  "monitor API includes presence for the organizer",
);
const monFr = await api("GET", `/api/monitor/auctions/${auction.id}`, frTok);
ok(monFr.body.presence === undefined, "monitor API hides presence from franchises");

// Disconnect the franchise → it drops out of the report.
frSock.close();
const gone = await new Promise((resolve) => {
  orgSock.on("PRESENCE", (ev) => {
    if (!(fUser.id in ev.users)) resolve(true);
  });
  setTimeout(() => resolve(false), 15_000);
});
ok(gone, "a disconnected franchise disappears from the presence report");

clearTimeout(failTimer);
orgSock.close();

// --- Cleanup -----------------------------------------------------------------
await api("DELETE", `/api/auctions/${auction.id}`, orgTok, null, false);
await api("DELETE", `/api/seasons/${season.id}`, orgTok, null, false);
await api("DELETE", `/api/leagues/${league.id}/franchises/${fr.id}`, orgTok, null, false);
await api("DELETE", `/api/leagues/${league.id}/franchises/${fr2.id}`, orgTok, null, false);
await api("DELETE", `/api/leagues/${league.id}`, orgTok, null, false);

console.log(`\n== pwd+presence test: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
