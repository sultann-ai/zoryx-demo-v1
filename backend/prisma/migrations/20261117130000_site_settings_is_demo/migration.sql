-- Phase 2, task 4: marks a demo install (set only by the demo seed). Additive only, default false.
-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;
