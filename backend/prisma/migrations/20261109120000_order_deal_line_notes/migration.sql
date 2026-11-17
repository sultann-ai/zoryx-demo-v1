-- Per-line note for a whole deal line (OrderItem.notes already covers direct items).
-- Additive: new nullable column, no backfill needed.
ALTER TABLE "OrderDealLine" ADD COLUMN "notes" TEXT;
