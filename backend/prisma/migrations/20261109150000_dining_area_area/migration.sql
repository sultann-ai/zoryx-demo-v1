-- Free-text area/room a table belongs to, for the New Order table filter.
-- Additive: new nullable column. The backfill only fills the new column, from the hall that
-- `type` already encoded; existing columns are untouched and TABLE rows stay NULL ("Other").
ALTER TABLE "DiningArea" ADD COLUMN "area" TEXT;

UPDATE "DiningArea" SET "area" = 'Family Hall' WHERE "type" = 'FAMILY_HALL';
UPDATE "DiningArea" SET "area" = 'Gents Hall' WHERE "type" = 'GENTS_HALL';
