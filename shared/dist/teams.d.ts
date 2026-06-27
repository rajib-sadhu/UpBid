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
