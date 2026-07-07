-- Backfill: accounts provisioned before the mustChangePassword flag existed
-- still sign in with a password their creator set. Force them all to choose
-- their own on next login. The seed SUPER_ADMIN is excluded — its credentials
-- come from .env and are self-managed.
UPDATE `User`
SET `mustChangePassword` = TRUE
WHERE `role` <> 'SUPER_ADMIN';
