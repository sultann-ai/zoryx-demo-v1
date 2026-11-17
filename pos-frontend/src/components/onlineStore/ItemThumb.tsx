import { mediaUrl } from "../../lib/mediaUrl";
import { cn } from "../ui/cn";

// Soft tint pairs from the theme's chart palette (static class names so Tailwind emits them).
const TINTS = [
  "from-chart-1-bg to-surface text-chart-1",
  "from-chart-2-bg to-surface text-chart-2",
  "from-chart-3-bg to-surface text-chart-3",
  "from-chart-4-bg to-surface text-chart-4",
  "from-chart-5-bg to-surface text-chart-5",
] as const;

// The same name always gets the same tint, so a card does not change colour between renders.
function tintFor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.codePointAt(0)!) % 997;
  }
  return TINTS[hash % TINTS.length] ?? TINTS[0];
}

interface ItemThumbProps {
  mediaId: string | null;
  // The item's name: it is the picture's alt text, and its first letter fills the placeholder.
  name: string;
  className?: string;
}

// A small fixed-size square for a catalog card: the stored photo, or (when there is none) a tinted
// placeholder with the item's initial and a little picture glyph. The size is the same either way, so
// a card without a photo is exactly as tall as one with.
export function ItemThumb({ mediaId, name, className }: ItemThumbProps) {
  const box = cn("relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-card border border-border", className);

  if (mediaId === null) {
    const initial = [...name.trim()][0]?.toUpperCase() ?? "?";
    return (
      <div role="img" aria-label={`${name}: no photo yet`} className={cn(box, "flex items-center justify-center bg-gradient-to-br", tintFor(name))}>
        <span aria-hidden="true" className="font-heading text-title font-semibold leading-none">
          {initial}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute bottom-1 right-1 h-4 w-4 opacity-60"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10.5" r="1.5" />
          <path d="m21 16-5-5-8 8" />
        </svg>
      </div>
    );
  }
  return (
    <div className={cn(box, "bg-surface")}>
      <img src={mediaUrl(mediaId, "thumb")} alt={name} loading="lazy" className="h-full w-full object-cover" />
    </div>
  );
}
