-- Raffle coins (sim squeek-2): the raffle needs every coin collected.
ALTER TABLE runs ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;
