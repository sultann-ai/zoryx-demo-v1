-- Table sync backfill (docs/TABLE_SYNC_SPEC.md §3.2). Hand-written, data only, additive.
-- Before this change, POS and order-taker dine-in orders stored only "diningAreaId", so their tables
-- read EMPTY on the floor map. This attaches the ACTIVE business day's open dine-in orders to their
-- table's session: an existing OPEN session of the same table and day, or a new one (openedVia
-- MIGRATION). Orders of earlier (ended) days are left alone; scripts/check-table-sync.ts lists them.
-- Every statement only touches rows that still need it, so running this file again changes nothing.
-- (Kept in its own migration: the enum values it uses were added by the previous one.)

-- 1. Attach to an OPEN session of the same table and the same (active) business day.
UPDATE "Order" o
SET "tableSessionId" = COALESCE(s."mergedIntoSessionId", s."id"), "updatedAt" = now()
FROM "TableSession" s, "BusinessDay" d
WHERE o."tableSessionId" IS NULL
  AND o."type" = 'DINE_IN'
  AND o."diningAreaId" IS NOT NULL
  AND o."status" IN ('AWAITING_RECEPTION', 'PENDING', 'CONFIRMED', 'IN_KITCHEN', 'READY')
  AND d."id" = o."businessDayId" AND d."isActive" = true
  AND s."diningAreaId" = o."diningAreaId" AND s."status" = 'OPEN' AND s."businessDayId" = o."businessDayId";

-- 2. One MIGRATION session per table that still has such orders and no OPEN session at all. Opened by
--    whoever placed its earliest order (else whoever opened the day), at that order's time; its waiter is
--    that person when they are an active order taker. No PIN.
INSERT INTO "TableSession" ("id", "diningAreaId", "businessDayId", "status", "seatedById", "seatedAt", "waiterStaffId", "openedVia", "version", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, first."diningAreaId", first."businessDayId", 'OPEN',
       COALESCE(first."placedByStaffId", first."openedById"), first."createdAt", taker."id", 'MIGRATION', 0, now(), now()
FROM (
  SELECT DISTINCT ON (o."diningAreaId") o."diningAreaId", o."businessDayId", o."placedByStaffId", o."createdAt", d."openedById"
  FROM "Order" o
  JOIN "BusinessDay" d ON d."id" = o."businessDayId" AND d."isActive" = true
  WHERE o."tableSessionId" IS NULL
    AND o."type" = 'DINE_IN'
    AND o."diningAreaId" IS NOT NULL
    AND o."status" IN ('AWAITING_RECEPTION', 'PENDING', 'CONFIRMED', 'IN_KITCHEN', 'READY')
  ORDER BY o."diningAreaId", o."createdAt"
) first
LEFT JOIN "StaffUser" taker ON taker."id" = first."placedByStaffId" AND taker."role" = 'ORDER_TAKER' AND taker."isActive" = true
WHERE NOT EXISTS (SELECT 1 FROM "TableSession" s WHERE s."diningAreaId" = first."diningAreaId" AND s."status" = 'OPEN')
ON CONFLICT DO NOTHING;

-- 3. Attach the remaining orders to the sessions step 2 made (the same statement as step 1).
UPDATE "Order" o
SET "tableSessionId" = COALESCE(s."mergedIntoSessionId", s."id"), "updatedAt" = now()
FROM "TableSession" s, "BusinessDay" d
WHERE o."tableSessionId" IS NULL
  AND o."type" = 'DINE_IN'
  AND o."diningAreaId" IS NOT NULL
  AND o."status" IN ('AWAITING_RECEPTION', 'PENDING', 'CONFIRMED', 'IN_KITCHEN', 'READY')
  AND d."id" = o."businessDayId" AND d."isActive" = true
  AND s."diningAreaId" = o."diningAreaId" AND s."status" = 'OPEN' AND s."businessDayId" = o."businessDayId";

-- 4. One MIGRATED event per MIGRATION session (only for those that don't have one yet).
INSERT INTO "TableSessionEvent" ("id", "sessionId", "type", "after", "createdAt")
SELECT gen_random_uuid()::text, s."id", 'MIGRATED',
       jsonb_build_object('orderCount', (SELECT count(*) FROM "Order" o WHERE o."tableSessionId" = s."id")), now()
FROM "TableSession" s
WHERE s."openedVia" = 'MIGRATION'
  AND NOT EXISTS (SELECT 1 FROM "TableSessionEvent" e WHERE e."sessionId" = s."id" AND e."type" = 'MIGRATED');
