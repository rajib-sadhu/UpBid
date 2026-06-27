-- Drop the redundant min/max team bounds from AuctionRules. Participating teams
-- are chosen explicitly per season; go-live now only requires at least 2 teams,
-- so these planning columns no longer drive any logic.
ALTER TABLE `AuctionRules`
    DROP COLUMN `minTeams`,
    DROP COLUMN `maxTeams`;
