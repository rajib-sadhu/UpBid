-- Cricket player attributes: structured playing role + conditional fields
-- (null for non-cricket players). Batting position applies to all cricket roles;
-- bowling style to BOWLER / ALL_ROUNDER; all-rounder type to ALL_ROUNDER only.
ALTER TABLE `Player`
    ADD COLUMN `cricketRole` ENUM('BATSMAN', 'BOWLER', 'WICKETKEEPER', 'ALL_ROUNDER') NULL,
    ADD COLUMN `battingPosition` ENUM('OPENER', 'MIDDLE', 'LOWER') NULL,
    ADD COLUMN `bowlingStyle` ENUM('FAST', 'MEDIUM_FAST', 'SPINNER') NULL,
    ADD COLUMN `allRounderType` ENUM('ALL_ROUNDER', 'BATTING', 'BOWLING') NULL;
