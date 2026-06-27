// A Team is a per-auction participation of a league Franchise (see franchise.ts):
// it carries the auction-specific budget/squad tallies. Identity fields
// (name, shortName, colors, logoUrl, owner) are sourced from the franchise.
// Teams are materialized at go-live from the season's selected franchises — there
// is no direct team create/update endpoint.

export interface Team {
  id: string;
  auctionId: string;
  franchiseId: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string | null;
  logoUrl: string | null;
  committedAmount: string;
  playerCount: number;
  createdAt: string;
}
