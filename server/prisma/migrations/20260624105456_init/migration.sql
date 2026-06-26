-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `role` ENUM('SUPER_ADMIN', 'ORGANIZER', 'FRANCHISE') NOT NULL,
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'INVITED',
    `inviteToken` VARCHAR(191) NULL,
    `invitedAt` DATETIME(3) NULL,
    `activatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_inviteToken_key`(`inviteToken`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `League` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sport` ENUM('CRICKET', 'FOOTBALL', 'BASKETBALL', 'OTHER') NOT NULL,
    `organizerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `League_organizerId_idx`(`organizerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Season` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `leagueId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Season_leagueId_idx`(`leagueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Player` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sport` ENUM('CRICKET', 'FOOTBALL', 'BASKETBALL', 'OTHER') NOT NULL,
    `role` VARCHAR(191) NULL,
    `nationality` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `photoUrl` VARCHAR(191) NULL,
    `externalRef` VARCHAR(191) NULL,
    `footballPosition` ENUM('GK', 'DEF', 'MID', 'FWD') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Player_sport_idx`(`sport`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlayerLeagueStatus` (
    `id` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `leagueId` VARCHAR(191) NOT NULL,
    `banned` BOOLEAN NOT NULL DEFAULT false,
    `bannedReason` VARCHAR(191) NULL,
    `bannedAt` DATETIME(3) NULL,
    `bannedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlayerLeagueStatus_leagueId_banned_idx`(`leagueId`, `banned`),
    UNIQUE INDEX `PlayerLeagueStatus_playerId_leagueId_key`(`playerId`, `leagueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Auction` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `seasonId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'LIVE', 'PAUSED', 'RE_AUCTION', 'ASSIGNMENT', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `biddingMode` ENUM('ORGANIZER', 'FRANCHISE') NOT NULL DEFAULT 'FRANCHISE',
    `round` ENUM('MAIN', 'RE_AUCTION', 'ASSIGNMENT') NOT NULL DEFAULT 'MAIN',
    `currentAuctionPlayerId` VARCHAR(191) NULL,
    `currentLotEndsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Auction_currentAuctionPlayerId_key`(`currentAuctionPlayerId`),
    INDEX `Auction_seasonId_idx`(`seasonId`),
    INDEX `Auction_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuctionRules` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `creditPerTeam` DECIMAL(14, 4) NOT NULL,
    `minPlayersPerTeam` INTEGER NOT NULL,
    `maxPlayersPerTeam` INTEGER NOT NULL,
    `minTeams` INTEGER NOT NULL,
    `maxTeams` INTEGER NOT NULL,
    `unsoldPrice` DECIMAL(14, 4) NOT NULL,
    `defaultLotDurationSec` INTEGER NOT NULL DEFAULT 30,

    UNIQUE INDEX `AuctionRules_auctionId_key`(`auctionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BidIncrementTier` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `fromAmount` DECIMAL(14, 4) NOT NULL,
    `increment` DECIMAL(14, 4) NOT NULL,

    INDEX `BidIncrementTier_auctionId_idx`(`auctionId`),
    UNIQUE INDEX `BidIncrementTier_auctionId_fromAmount_key`(`auctionId`, `fromAmount`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(191) NULL,
    `logoUrl` VARCHAR(191) NULL,
    `committedAmount` DECIMAL(14, 4) NOT NULL DEFAULT 0,
    `playerCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Team_auctionId_idx`(`auctionId`),
    UNIQUE INDEX `Team_auctionId_ownerUserId_key`(`auctionId`, `ownerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuctionPlayer` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `basePrice` DECIMAL(14, 4) NOT NULL,
    `round` ENUM('MAIN', 'RE_AUCTION', 'ASSIGNMENT') NOT NULL DEFAULT 'MAIN',
    `status` ENUM('PENDING', 'ON_BLOCK', 'SOLD', 'UNSOLD', 'ASSIGNED') NOT NULL DEFAULT 'PENDING',
    `lotOrder` INTEGER NULL,
    `isOverseas` BOOLEAN NOT NULL DEFAULT false,
    `currentPrice` DECIMAL(14, 4) NULL,
    `leadingTeamId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `soldPrice` DECIMAL(14, 4) NULL,
    `soldToTeamId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuctionPlayer_auctionId_status_idx`(`auctionId`, `status`),
    INDEX `AuctionPlayer_auctionId_round_idx`(`auctionId`, `round`),
    UNIQUE INDEX `AuctionPlayer_auctionId_playerId_key`(`auctionId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bid` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `auctionPlayerId` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `bidderUserId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 4) NOT NULL,
    `clientBidId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Bid_auctionPlayerId_createdAt_idx`(`auctionPlayerId`, `createdAt`),
    INDEX `Bid_teamId_idx`(`teamId`),
    INDEX `Bid_auctionId_idx`(`auctionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamPlayer` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `auctionPlayerId` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `price` DECIMAL(14, 4) NOT NULL,
    `acquiredVia` ENUM('AUCTION', 'REAUCTION', 'CHOSEN', 'FORCE_ASSIGNED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TeamPlayer_auctionPlayerId_key`(`auctionPlayerId`),
    INDEX `TeamPlayer_teamId_idx`(`teamId`),
    INDEX `TeamPlayer_playerId_idx`(`playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LineupRules` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `startingSize` INTEGER NOT NULL DEFAULT 11,
    `overseasCapEnabled` BOOLEAN NOT NULL DEFAULT false,
    `maxOverseasInXI` INTEGER NULL,
    `requireWicketkeeper` BOOLEAN NOT NULL DEFAULT true,
    `requireCaptain` BOOLEAN NOT NULL DEFAULT true,
    `requireViceCaptain` BOOLEAN NOT NULL DEFAULT true,
    `requireFirstBowler` BOOLEAN NOT NULL DEFAULT true,
    `requireSecondBowler` BOOLEAN NOT NULL DEFAULT true,
    `requireFullBattingOrder` BOOLEAN NOT NULL DEFAULT true,
    `benchSize` INTEGER NULL,
    `editableAfterLockByOwner` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LineupRules_auctionId_key`(`auctionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Formation` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `numGK` INTEGER NOT NULL DEFAULT 1,
    `numDef` INTEGER NOT NULL,
    `numMid` INTEGER NOT NULL,
    `numFwd` INTEGER NOT NULL,

    UNIQUE INDEX `Formation_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuctionAllowedFormation` (
    `id` VARCHAR(191) NOT NULL,
    `auctionId` VARCHAR(191) NOT NULL,
    `formationId` VARCHAR(191) NOT NULL,

    INDEX `AuctionAllowedFormation_auctionId_idx`(`auctionId`),
    UNIQUE INDEX `AuctionAllowedFormation_auctionId_formationId_key`(`auctionId`, `formationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lineup` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'LOCKED') NOT NULL DEFAULT 'DRAFT',
    `formationId` VARCHAR(191) NULL,
    `lockedById` VARCHAR(191) NULL,
    `lockedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Lineup_teamId_key`(`teamId`),
    INDEX `Lineup_formationId_idx`(`formationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LineupMember` (
    `id` VARCHAR(191) NOT NULL,
    `lineupId` VARCHAR(191) NOT NULL,
    `teamPlayerId` VARCHAR(191) NOT NULL,
    `membership` ENUM('STARTER', 'BENCH', 'RESERVE') NOT NULL DEFAULT 'RESERVE',
    `battingOrder` INTEGER NULL,
    `isWicketkeeper` BOOLEAN NOT NULL DEFAULT false,
    `isFirstBowler` BOOLEAN NOT NULL DEFAULT false,
    `isSecondBowler` BOOLEAN NOT NULL DEFAULT false,
    `isCaptain` BOOLEAN NOT NULL DEFAULT false,
    `isViceCaptain` BOOLEAN NOT NULL DEFAULT false,
    `assignedPosition` ENUM('GK', 'DEF', 'MID', 'FWD') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LineupMember_teamPlayerId_key`(`teamPlayerId`),
    INDEX `LineupMember_lineupId_membership_idx`(`lineupId`, `membership`),
    UNIQUE INDEX `LineupMember_lineupId_battingOrder_key`(`lineupId`, `battingOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `League` ADD CONSTRAINT `League_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Season` ADD CONSTRAINT `Season_leagueId_fkey` FOREIGN KEY (`leagueId`) REFERENCES `League`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerLeagueStatus` ADD CONSTRAINT `PlayerLeagueStatus_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerLeagueStatus` ADD CONSTRAINT `PlayerLeagueStatus_leagueId_fkey` FOREIGN KEY (`leagueId`) REFERENCES `League`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerLeagueStatus` ADD CONSTRAINT `PlayerLeagueStatus_bannedById_fkey` FOREIGN KEY (`bannedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Auction` ADD CONSTRAINT `Auction_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `Season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Auction` ADD CONSTRAINT `Auction_currentAuctionPlayerId_fkey` FOREIGN KEY (`currentAuctionPlayerId`) REFERENCES `AuctionPlayer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionRules` ADD CONSTRAINT `AuctionRules_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BidIncrementTier` ADD CONSTRAINT `BidIncrementTier_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionPlayer` ADD CONSTRAINT `AuctionPlayer_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionPlayer` ADD CONSTRAINT `AuctionPlayer_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionPlayer` ADD CONSTRAINT `AuctionPlayer_leadingTeamId_fkey` FOREIGN KEY (`leadingTeamId`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionPlayer` ADD CONSTRAINT `AuctionPlayer_soldToTeamId_fkey` FOREIGN KEY (`soldToTeamId`) REFERENCES `Team`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bid` ADD CONSTRAINT `Bid_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bid` ADD CONSTRAINT `Bid_auctionPlayerId_fkey` FOREIGN KEY (`auctionPlayerId`) REFERENCES `AuctionPlayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bid` ADD CONSTRAINT `Bid_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bid` ADD CONSTRAINT `Bid_bidderUserId_fkey` FOREIGN KEY (`bidderUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamPlayer` ADD CONSTRAINT `TeamPlayer_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamPlayer` ADD CONSTRAINT `TeamPlayer_auctionPlayerId_fkey` FOREIGN KEY (`auctionPlayerId`) REFERENCES `AuctionPlayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamPlayer` ADD CONSTRAINT `TeamPlayer_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LineupRules` ADD CONSTRAINT `LineupRules_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionAllowedFormation` ADD CONSTRAINT `AuctionAllowedFormation_auctionId_fkey` FOREIGN KEY (`auctionId`) REFERENCES `Auction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuctionAllowedFormation` ADD CONSTRAINT `AuctionAllowedFormation_formationId_fkey` FOREIGN KEY (`formationId`) REFERENCES `Formation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lineup` ADD CONSTRAINT `Lineup_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lineup` ADD CONSTRAINT `Lineup_formationId_fkey` FOREIGN KEY (`formationId`) REFERENCES `Formation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lineup` ADD CONSTRAINT `Lineup_lockedById_fkey` FOREIGN KEY (`lockedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LineupMember` ADD CONSTRAINT `LineupMember_lineupId_fkey` FOREIGN KEY (`lineupId`) REFERENCES `Lineup`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LineupMember` ADD CONSTRAINT `LineupMember_teamPlayerId_fkey` FOREIGN KEY (`teamPlayerId`) REFERENCES `TeamPlayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
