import axios from "axios";
import { useCallback, useState } from "react";
import { getApiErrorMessage, getApiErrorStatus } from "../../api/errors";
import type { MediaKind, UploadedMedia } from "../../api/media";
import { mediaApi } from "../../api/media";
import { downscaleImage, ImageProcessingError } from "../../lib/imageResize";

export type UploadPhase = "idle" | "preparing" | "uploading" | "saving" | "error";

export interface UploadState {
  phase: UploadPhase;
  // 0-100 while "uploading".
  percent: number;
  error: string | null;
}

const IDLE: UploadState = { phase: "idle", percent: 0, error: null };

// A message a shop owner can act on, never "Request failed with status code 400". The server's own text
// (it is always { error: string }) is shown as it is.
export function describeUploadError(error: unknown): string {
  if (error instanceof ImageProcessingError) {
    return error.message;
  }
  if (axios.isAxiosError(error) && !error.response) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  if (getApiErrorStatus(error) === 413) {
    return "That photo is too big. Please choose a smaller one.";
  }
  return getApiErrorMessage(error, "The photo could not be uploaded. Please try again.");
}

// One photo's journey: shrink it in the browser, send it with progress, then (optionally) let the caller
// attach it to something. State is per hook instance, so each card/row has its own progress bar.
export function usePhotoUpload(kind: MediaKind, outputType: "image/jpeg" | "image/png" = "image/jpeg") {
  const [state, setState] = useState<UploadState>(IDLE);

  const upload = useCallback(
    async (file: File, onUploaded?: (media: UploadedMedia) => Promise<unknown> | void): Promise<UploadedMedia | null> => {
      setState({ phase: "preparing", percent: 0, error: null });
      try {
        const prepared = await downscaleImage(file, { outputType });
        setState({ phase: "uploading", percent: 0, error: null });
        const media = await mediaApi.upload(prepared, kind, (percent) =>
          setState((previous) => (previous.phase === "uploading" ? { ...previous, percent } : previous)),
        );
        if (onUploaded) {
          // The photo is stored; attaching it (a second request) is the last step.
          setState({ phase: "saving", percent: 100, error: null });
          await onUploaded(media);
        }
        setState(IDLE);
        return media;
      } catch (error) {
        setState({ phase: "error", percent: 0, error: describeUploadError(error) });
        return null;
      }
    },
    [kind, outputType],
  );

  const reset = useCallback(() => setState(IDLE), []);

  return { state, upload, reset, isBusy: state.phase === "preparing" || state.phase === "uploading" || state.phase === "saving" };
}
