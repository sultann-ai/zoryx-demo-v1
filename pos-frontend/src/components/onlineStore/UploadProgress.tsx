import type { UploadState } from "./usePhotoUpload";

const PHASE_LABEL = {
  preparing: "Preparing photo…",
  saving: "Saving…",
} as const;

// The status line under an upload button: a progress bar while the bytes go up, short text for the quick
// phases either side of it, and the error (role="alert") when something went wrong.
export function UploadProgress({ state }: { state: UploadState }) {
  if (state.phase === "idle") {
    return null;
  }
  if (state.phase === "error") {
    return (
      <p role="alert" className="text-meta text-status-danger-text">
        {state.error}
      </p>
    );
  }
  if (state.phase === "uploading") {
    return (
      <div className="flex flex-col gap-1" role="status">
        <div className="h-2 w-full overflow-hidden rounded-full bg-status-neutral-bg" aria-hidden="true">
          <div className="h-full bg-status-active transition-[width]" style={{ width: `${state.percent}%` }} />
        </div>
        <span className="text-meta text-ink-muted">Uploading… {state.percent}%</span>
      </div>
    );
  }
  return (
    <span role="status" className="text-meta text-ink-muted">
      {PHASE_LABEL[state.phase]}
    </span>
  );
}
