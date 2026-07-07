import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { E2E } from "./fixtures.js";

// Happy path B (build-plan §9): the franchise owner builds a valid cricket XI
// on the seeded COMPLETED auction (add 11, assign keeper/captain/vice/bowler
// roles, save), then the organizer locks the lineup.

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

/** Resolve the owner's team id in the lineup auction via the API. */
async function findTeamId(request: APIRequestContext): Promise<string> {
  const auth = await request.post("/api/auth/login", {
    data: { email: E2E.owner.email, password: E2E.owner.password },
  });
  const { token } = (await auth.json()) as { token: string };
  const res = await request.get("/api/monitor/my-teams", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as
    | { auctionName: string; teamId: string }[]
    | { data: { auctionName: string; teamId: string }[] };
  const teams = Array.isArray(body) ? body : body.data;
  const mine = teams.find((t) => t.auctionName === E2E.lineupAuction.name);
  if (!mine) throw new Error(`No team found in "${E2E.lineupAuction.name}"`);
  return mine.teamId;
}

test("franchise builds a valid XI and the organizer locks it", async ({ page, request }) => {
  const teamId = await findTeamId(request);

  // --- Franchise owner: build and save the XI -----------------------------
  await login(page, E2E.owner.email, E2E.owner.password);
  await page.goto(`/teams/${teamId}/lineup`);
  await expect(page.getByRole("heading", { name: /Lineup/ })).toBeVisible();

  // Add the first 11 squad players to the XI (position = batting order).
  for (let i = 0; i < 11; i++) {
    await page.getByTitle("Add to XI").first().click();
  }
  await expect(page.getByText("Everyone is in the XI.")).toHaveCount(0); // 1 of 12 left over

  // Roles by XI position (seed order): 0 = wicketkeeper, 6 and 8 = bowlers;
  // captain and vice-captain on two different batsmen. Target the chip BUTTONS
  // by their exact short label (titles collide with the player role icons),
  // and click until the active (amber) state sticks — a click can be swallowed
  // by a re-render.
  const assignRole = (label: string, index: number) =>
    expect(async () => {
      const chip = page.getByRole("button", { name: label, exact: true }).nth(index);
      if (!((await chip.getAttribute("class")) ?? "").includes("text-amber-300")) {
        await chip.click();
      }
      expect(((await chip.getAttribute("class")) ?? "").includes("text-amber-300")).toBe(true);
    }).toPass();

  await assignRole("WK", 0);
  await assignRole("C", 1);
  await assignRole("VC", 2);
  await assignRole("1B", 6);
  await assignRole("2B", 8);

  await expect(page.getByText("To save, still needed:")).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved — lineup complete.")).toBeVisible();
  await expect(page.getByText("No validation issues — ready to lock.")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();

  // --- Organizer: lock the lineup -----------------------------------------
  await login(page, E2E.organizer.email, E2E.organizer.password);
  await page.goto(`/teams/${teamId}/lineup`);
  await expect(page.getByText("No validation issues — ready to lock.")).toBeVisible();
  await page.getByRole("button", { name: "Lock lineup" }).click();
  await expect(page.getByText("Lineup locked.")).toBeVisible();
  await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
});
