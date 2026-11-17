// role="status" so a screen reader announces it. Renders nothing (and no layout) when hidden, but keeps a
// fixed minimum width in the parent row via the caller if a jump is a problem.
export function SavedTick({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null;
  }
  return (
    <span role="status" className="inline-flex items-center gap-1 text-meta font-medium text-status-success-text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d="m5 12 5 5 9-10" />
      </svg>
      Saved
    </span>
  );
}
