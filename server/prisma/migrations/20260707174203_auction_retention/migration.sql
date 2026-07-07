-- AlterTable
ALTER TABLE `Auction` ADD COLUMN `retentionSourceAuctionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `AuctionPlayer` MODIFY `status` ENUM('PENDING', 'ON_BLOCK', 'SOLD', 'UNSOLD', 'ASSIGNED', 'RETAINED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `AuctionRules` ADD COLUMN `maxRetentionsPerTeam` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `TeamPlayer` MODIFY `acquiredVia` ENUM('AUCTION', 'REAUCTION', 'CHOSEN', 'FORCE_ASSIGNED', 'RETAINED') NOT NULL;

-- CreateTable
CREATE TABLE `AuctionRetention` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `franchiseId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `price` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuctionRetention_auctionId_franchiseId_idx`(`auctionId`, `franchiseId`),
    UNIQUE INDEX `AuctionRetention_auctionId_playerId_key`(`auctionId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Auction` ADD CONSTRAINT `Auction_retentionSourceAuctionId_fkey` FOREIGN KEY (`retentionSourceAuctionId`) REFERENCES `Auction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionRetention` ADD CONSTRAINT `AuctionRetention_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionRetention` ADD CONSTRAINT `AuctionRetention_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `Franchise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionRetention` ADD CONSTRAINT `AuctionRetention_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
