import { apiClient } from "./client";

// What a staff upload is for. (PAYMENT_PROOF is a customer's screenshot and never uploaded from here.)
export type MediaKind = "MENU_ITEM" | "DEAL" | "GALLERY" | "PAYMENT_QR" | "CATEGORY";

export interface UploadedMedia {
  id: string;
  kind: MediaKind;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  // A cut-out photo (background removed) keeps its transparent pixels instead of being cropped to 4:3.
  hasTransparency: boolean;
  // Relative to the API origin — see lib/mediaUrl.ts.
  urls: { thumb: string; full: string };
}

export const mediaApi = {
  // multipart: the server checks the real format, crops photos to 4:3 (a cut-out is fitted inside instead) and stores the result in Postgres.
  // onProgress receives 0-100 while the bytes go up.
  upload: async (file: File, kind: MediaKind, onProgress?: (percent: number) => void): Promise<UploadedMedia> => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    const { data } = await apiClient.post<UploadedMedia>("/api/pos/media", form, {
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      },
    });
    return data;
  },
};
