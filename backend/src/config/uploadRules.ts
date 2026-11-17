// Pure upload rules (no fs, no multer instance) so they can be unit-tested and imported by the
// error handler without touching the uploads directory.

// Extension comes from the validated mime type, never from the client's filename: /uploads is
// served statically, so a spoofed "image/png" upload named x.html would otherwise be served
// back as HTML from the API origin.
export const ALLOWED_UPLOADS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

export function extensionForMime(mimetype: string): string | undefined {
  return ALLOWED_UPLOADS[mimetype];
}
