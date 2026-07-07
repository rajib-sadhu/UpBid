import { test, expect, type Page } from "@playwright/test";
import { E2E } from "./fixtures.js";

// Happy path A (build-plan §9): organizer logs in, takes the seeded DRAFT
// auction live, runs both lots through the real Socket.io pipeline (bid war →
// sold, no bids → unsold), force-assigns in the ASSIGNMENT phase and completes
// the auction — all through the production-served UI.

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

test("organizer runs a tiny auction end to end", async ({ page }) => {
  // Some organizer controls use native confirm() — accept them all.
  page.on("dialog", (dialog) => void dialog.accept());

  await login(page, E2E.organizer.email, E2E.organizer.password);

  // Navigate: Leagues → league → season → auction setup.
  await page.getByRole("link", { name: "Leagues", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(E2E.league.name) }).click();
  await page.getByRole("link", { name: new RegExp(E2E.season.name) }).click();
  await page.getByRole("link", { name: new RegExp(E2E.liveAuction.name) }).click();
  await expect(page.getByRole("heading", { name: E2E.liveAuction.name })).toBeVisible();

  // Retention: allow 1 per team, retain a previous-season player for E2E Alpha
  // from the completed lineup auction at an edited price of 3 (was 2).
  await page.getByLabel("Max retentions / team").fill("1");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Rules saved")).toBeVisible();

  await page
    .getByLabel("Retain from")
    .selectOption({ label: `${E2E.lineupAuction.name} (${E2E.season.name})` });
  await page.getByLabel("Retain E2E Squad 01").check();
  await page.getByLabel("Retention price for E2E Squad 01").fill("3");
  await page.getByRole("button", { name: "Save retentions" }).first().click();
  await expect(page.getByText("Retentions saved")).toBeVisible();

  // DRAFT → LIVE, then into the live room.
  await page.getByRole("button", { name: "Go live →" }).click();
  await expect(page.getByText("Auction is now LIVE.")).toBeVisible();
  await page.getByRole("link", { name: "Open live auction →" }).click();
  await expect(page.getByRole("heading", { name: E2E.liveAuction.name })).toBeVisible();

  // The retention materialized: Alpha starts with 1 player, 3 cr spent, and
  // the lots board reports the retained count.
  await expect(page.getByText("Spent 3 cr").first()).toBeVisible();
  await expect(page.getByText(/1 retained/)).toBeVisible();

  // Lot 1: open, organizer bids on behalf of both teams, sells to the leader.
  // Lot order is randomized at go-live, so never assert a specific player —
  // just that one of the seeded players is on the block.
  const onBlock = new RegExp(E2E.livePlayers.join("|"));
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: onBlock })).toBeVisible();
  await expect(page.getByText("Tap a team to bid")).toBeVisible();

  await page.getByRole("button", { name: new RegExp(E2E.franchises[0].name) }).click();
  await expect(page.getByText("2.5 cr").first()).toBeVisible(); // next required bid moved
  await page.getByRole("button", { name: new RegExp(E2E.franchises[1].name) }).click();
  await expect(page.getByText("3 cr").first()).toBeVisible();

  await page.getByRole("button", { name: "Sell to leader" }).click();
  await expect(page.getByText("No lot on the block").first()).toBeVisible();

  // Lot 2: open and mark unsold without a bid.
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: onBlock })).toBeVisible();
  await page.getByRole("button", { name: "Mark unsold" }).click();
  await expect(page.getByText("No lot on the block").first()).toBeVisible();

  // ASSIGNMENT: the team that won nothing is below the minimum of 1 — the
  // organizer force-assigns the unsold player to it, then ends the auction.
  await page.getByRole("button", { name: "Go to assignment" }).click();
  await expect(page.getByText(/Assignment — fill teams to the minimum/)).toBeVisible();

  await page.getByRole("button", { name: "Assign ▾" }).click();
  await page
    .getByRole("button", { name: new RegExp(E2E.franchises[0].shortName) })
    .first()
    .click();

  await page.getByRole("button", { name: "End this auction" }).click();
  await expect(page.getByText("Auction completed.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Build lineup →" }).first()).toBeVisible();
});
