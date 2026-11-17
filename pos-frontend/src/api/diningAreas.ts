import { createCrudApi } from "./crud";

export type DiningAreaType = "TABLE" | "FAMILY_HALL" | "GENTS_HALL";

export interface DiningArea {
  id: string;
  name: string;
  type: DiningAreaType;
  // The room/section the table is in ("Family Hall") — free text, trimmed server-side, at
  // most DINING_AREA_SECTION_MAX_LENGTH characters; null = none ("Other" in the pickers).
  area: string | null;
  capacity: number | null;
  isActive: boolean;
}

// Mirrors the backend's DINING_AREA_SECTION_MAX_LENGTH (diningArea.service.ts).
export const DINING_AREA_SECTION_MAX_LENGTH = 50;

export interface DiningAreaCreateInput {
  name: string;
  type: DiningAreaType;
  area?: string;
  // Omit entirely when empty — the backend rejects an explicit null on create.
  capacity?: number;
}

export interface DiningAreaUpdateInput {
  name?: string;
  type?: DiningAreaType;
  // "" or null clears it.
  area?: string | null;
  // null clears a previously-set capacity.
  capacity?: number | null;
}

export const diningAreasApi = createCrudApi<DiningArea, DiningAreaCreateInput, DiningAreaUpdateInput>(
  "/api/pos/dining-areas",
);
