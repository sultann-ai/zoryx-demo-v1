import multer from "multer";
import { extensionForMime, UploadRejectedError } from "./uploadRules";

export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

// In-memory (not disk): the bytes go straight to Postgres after sharp has processed them.
// The declared mime type is only a first, cheap filter; processImage.ts checks the real format.
function imageUpload(maxBytes: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (extensionForMime(file.mimetype) === undefined) {
        cb(new UploadRejectedError("Only JPEG, PNG, or WEBP images are allowed"));
        return;
      }
      cb(null, true);
    },
  });
}

// Staff uploads (menu photos, deal photos, gallery, payment QR): 8 MB.
export const mediaUpload = imageUpload(MEDIA_MAX_BYTES);

// A customer's payment screenshot (guest checkout, and the account route): 5 MB.
export const proofUpload = imageUpload(PROOF_MAX_BYTES);
