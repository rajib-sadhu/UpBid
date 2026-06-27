-- Narrow all monetary columns from Decimal(14,4) to Decimal(14,2) (crore units).
-- MySQL rounds any existing 4-decimal values to 2 decimals (half-up) in place.
ALTER TABLE `AuctionRules`
    MODIFY `creditPerTeam` DECIMAL(14, 2) NOT NULL,
    MODIFY `unsoldPrice` DECIMAL(14, 2) NOT NULL;

ALTER TABLE `BidIncrementTier`
    MODIFY `fromAmount` DECIMAL(14, 2) NOT NULL,
    MODIFY `increment` DECIMAL(14, 2) NOT NULL;

ALTER TABLE `Team`
    MODIFY `committedAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE `AuctionPlayer`
    MODIFY `basePrice` DECIMAL(14, 2) NOT NULL,
    MODIFY `currentPrice` DECIMAL(14, 2) NULL,
    MODIFY `soldPrice` DECIMAL(14, 2) NULL;

ALTER TABLE `Bid`
    MODIFY `amount` DECIMAL(14, 2) NOT NULL;

ALTER TABLE `TeamPlayer`
    MODIFY `price` DECIMAL(14, 2) NOT NULL;
