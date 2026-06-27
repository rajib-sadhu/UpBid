-- League: add 3-letter short code (backfill existing rows, then enforce NOT NULL),
-- unique per organizer.
ALTER TABLE `League` ADD COLUMN `shortName` VARCHAR(3) NULL;
UPDATE `League` SET `shortName` = 'BAL' WHERE `shortName` IS NULL;
ALTER TABLE `League` MODIFY COLUMN `shortName` VARCHAR(3) NOT NULL;
CREATE UNIQUE INDEX `League_organizerId_shortName_key` ON `League`(`organizerId`, `shortName`);

-- Franchise: league-level team identity (name, 3-letter code, theme color, logo, owner).
CREATE TABLE `Franchise` (
    `id` VARCHAR(191) NOT NULL,
    `leagueId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(3) NOT NULL,
    `primaryColor` VARCHAR(7) NOT NULL,
    `secondaryColor` VARCHAR(7) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Franchise_leagueId_idx`(`leagueId`),
    UNIQUE INDEX `Franchise_leagueId_shortName_key`(`leagueId`, `shortName`),
    UNIQUE INDEX `Franchise_leagueId_ownerUserId_key`(`leagueId`, `ownerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SeasonFranchise: which league franchises participate in a season.
CREATE TABLE `SeasonFranchise` (
    `id` VARCHAR(191) NOT NULL,
    `seasonId` VARCHAR(191) NOT NULL,
    `franchiseId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SeasonFranchise_seasonId_idx`(`seasonId`),
    INDEX `SeasonFranchise_franchiseId_idx`(`franchiseId`),
    UNIQUE INDEX `SeasonFranchise_seasonId_franchiseId_key`(`seasonId`, `franchiseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Team: identity (name/short/logo/owner) moves to Franchise; Team becomes a
-- per-auction participation referencing a franchise. (Team.auction FK + its
-- backing Team_auctionId_idx are left intact.)
ALTER TABLE `Team` DROP FOREIGN KEY `Team_ownerUserId_fkey`;
DROP INDEX `Team_auctionId_ownerUserId_key` ON `Team`;
DROP INDEX `Team_ownerUserId_fkey` ON `Team`;
ALTER TABLE `Team`
    DROP COLUMN `name`,
    DROP COLUMN `shortName`,
    DROP COLUMN `logoUrl`,
    DROP COLUMN `ownerUserId`,
    ADD COLUMN `franchiseId` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `Team_auctionId_franchiseId_key` ON `Team`(`auctionId`, `franchiseId`);

-- New foreign keys.
ALTER TABLE `Franchise` ADD CONSTRAINT `Franchise_leagueId_fkey` FOREIGN KEY (`leagueId`) REFERENCES `League`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Franchise` ADD CONSTRAINT `Franchise_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SeasonFranchise` ADD CONSTRAINT `SeasonFranchise_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SeasonFranchise` ADD CONSTRAINT `SeasonFranchise_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `Franchise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Team` ADD CONSTRAINT `Team_franchiseId_fkey` FOREIGN KEY (`franchiseId`) REFERENCES `Franchise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
