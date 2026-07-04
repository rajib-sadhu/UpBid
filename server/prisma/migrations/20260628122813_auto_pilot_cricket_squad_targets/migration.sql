-- AlterTable
ALTER TABLE `Auction` ADD COLUMN `autoPilot` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `CricketSquadTargets` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `minWicketkeepers` INTEGER NOT NULL DEFAULT 1,
    `minBatsmen` INTEGER NOT NULL DEFAULT 3,
    `minOpeners` INTEGER NOT NULL DEFAULT 2,
    `minPaceBowlers` INTEGER NOT NULL DEFAULT 2,
    `minSpinners` INTEGER NOT NULL DEFAULT 1,
    `minAllRounders` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `CricketSquadTargets_auctionId_key`(`auctionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CricketSquadTargets` ADD CONSTRAINT `CricketSquadTargets_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
