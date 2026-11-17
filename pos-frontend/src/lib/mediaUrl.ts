// A stored photo is served publicly (and cached for a year) by GET /api/online/media/:id on the API
// origin; the id changes whenever a photo is replaced, so a stale picture is never shown.
export function mediaUrl(mediaId: string, size: "thumb" | "full" = "thumb"): string {
  return `${import.meta.env.VITE_API_URL}/api/online/media/${mediaId}?size=${size}`;
}

// The customer website, for the "Open customer website" button. Empty when VITE_ONLINE_SITE_URL isn't set.
export const ONLINE_SITE_URL: string = (import.meta.env.VITE_ONLINE_SITE_URL ?? "").trim();
