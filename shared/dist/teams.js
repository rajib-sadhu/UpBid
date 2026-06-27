// A Team is a per-auction participation of a league Franchise (see franchise.ts):
// it carries the auction-specific budget/squad tallies. Identity fields
// (name, shortName, colors, logoUrl, owner) are sourced from the franchise.
// Teams are materialized at go-live from the season's selected franchises — there
// is no direct team create/update endpoint.
export {};
