import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage.js";
import { RequireAuth, RequireRole } from "./routes/guards.js";
import { AppLayout } from "./components/AppLayout.js";
import { DashboardPage } from "./features/dashboard/DashboardPage.js";
import { UsersPage } from "./features/users/UsersPage.js";
import { ViewLeaguesPage } from "./features/leagues/ViewLeaguesPage.js";
import { LeagueDetailPage } from "./features/leagues/LeagueDetailPage.js";
import { SeasonDetailPage } from "./features/seasons/SeasonDetailPage.js";
import { AuctionSetupPage } from "./features/auctions/AuctionSetupPage.js";
import { AuctionLivePage } from "./features/auction-live/AuctionLivePage.js";
import { AuctionMonitorPage } from "./features/monitor/AuctionMonitorPage.js";
import { LineupPage } from "./features/lineups/LineupPage.js";
import { ViewPlayersPage } from "./features/players/ViewPlayersPage.js";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          {/* Live auction + lineup builder are open to all roles (franchises act here). */}
          <Route path="/auctions/:id/live" element={<AuctionLivePage />} />
          <Route path="/auctions/:id/monitor" element={<AuctionMonitorPage />} />
          <Route path="/teams/:teamId/lineup" element={<LineupPage />} />
          <Route element={<RequireRole roles={["SUPER_ADMIN", "ORGANIZER"]} />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/leagues" element={<ViewLeaguesPage />} />
            <Route path="/leagues/:id" element={<LeagueDetailPage />} />
            <Route path="/seasons/:seasonId" element={<SeasonDetailPage />} />
            <Route path="/auctions/:id" element={<AuctionSetupPage />} />
            <Route path="/players" element={<ViewPlayersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
