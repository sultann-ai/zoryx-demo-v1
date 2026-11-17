import { mediaUrl } from "../../lib/mediaUrl";
import { cn } from "../ui/cn";

interface ImageThumbProps {
  // The stored photo's media id, or null for "no photo yet".
  mediaId: string | null;
  alt: string;
  // The aspect ratio of the box (photos are always 4:3 on the website); a QR code is square.
  shape?: "photo" | "square";
  size?: "thumb" | "full";
  className?: string;
}

// A stored photo, or a quiet placeholder where one is missing — so a grid of items makes gaps obvious
// at a glance without shouting.
export function ImageThumb({ mediaId, alt, shape = "photo", size = "thumb", className }: ImageThumbProps) {
  const box = cn("w-full overflow-hidden rounded-card border border-border", shape === "photo" ? "aspect-[4/3]" : "aspect-square", className);

  if (mediaId === null) {
    return (
      <div className={cn(box, "flex flex-col items-center justify-center gap-1 border-dashed bg-surface text-ink-muted")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10.5" r="1.5" />
          <path d="m21 16-5-5-8 8" />
        </svg>
        <span className="text-meta">No photo</span>
      </div>
    );
  }
  return (
    <div className={cn(box, "bg-surface")}>
      <img src={mediaUrl(mediaId, size)} alt={alt} loading="lazy" className="h-full w-full object-cover" />
    </div>
  );
}
