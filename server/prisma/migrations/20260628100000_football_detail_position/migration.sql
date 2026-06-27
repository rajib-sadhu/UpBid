-- Detailed football position (descriptive; null for non-football players).
-- Each value belongs to one broad bucket: GK→GK; DEF→RB/CB/LB; MID→DMF/CMF/AMF;
-- FWD→LW/RW/ST. The broad `footballPosition` remains authoritative for lineups.
ALTER TABLE `Player`
    ADD COLUMN `footballDetailPosition` ENUM('GK', 'RB', 'CB', 'LB', 'DMF', 'CMF', 'AMF', 'LW', 'RW', 'ST') NULL;
