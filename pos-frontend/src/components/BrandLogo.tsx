import { useIsDemo } from "../hooks/useAppInfo";

// Zoryx logo: rounded-square "Z" mark + live-text wordmark + "DEMO" pill (live text, never artwork).
// The pill shows only on a demo install (SiteSettings.isDemo, read from GET /api/pos/app-info).
// Sized by `size` (the wordmark's font-size in px); every other measure is in em so the lockup
// scales as one piece. "primary" is for cream/white backgrounds, "reversed" for forest green only.
type Variant = "primary" | "reversed";

const COLORS = {
  forest: "var(--color-brand-forest)",
  cream: "var(--color-brand-cream)",
  lime: "var(--color-brand-lime)",
};

export function BrandMark({ variant = "primary", size = 32 }: { variant?: Variant; size?: number }) {
  const reversed = variant === "reversed";
  const square = reversed ? COLORS.cream : COLORS.forest;
  const bars = reversed ? COLORS.forest : COLORS.cream;
  const diagonal = reversed ? COLORS.forest : COLORS.lime;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Zoryx" className="shrink-0">
      <rect width="64" height="64" rx="15" fill={square} />
      <rect x="16" y="15" width="32" height="8" rx="3" fill={bars} />
      <rect x="16" y="41" width="32" height="8" rx="3" fill={bars} />
      <path d="M44 23 L20 41" stroke={diagonal} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({ variant = "primary", size = 28 }: { variant?: Variant; size?: number }) {
  const reversed = variant === "reversed";
  const isDemo = useIsDemo();
  return (
    <span className="inline-flex items-center" style={{ fontSize: size, gap: "0.3em" }} aria-label={isDemo ? "Zoryx demo" : "Zoryx"}>
      <BrandMark variant={variant} size={size * 1.25} />
      <span className="inline-flex items-start">
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: reversed ? COLORS.cream : COLORS.forest,
          }}
        >
          zoryx
        </span>
        {isDemo && (
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontSize: "0.34em",
            lineHeight: 1,
            padding: "0.45em 0.8em",
            marginLeft: "0.35em",
            borderRadius: "9999px",
            background: reversed ? COLORS.lime : COLORS.forest,
            color: reversed ? COLORS.forest : COLORS.cream,
          }}
        >
          Demo
        </span>
        )}
      </span>
    </span>
  );
}
