import { useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "../BrandLogo";
import type { PushedRoute } from "../../routes/mobileShell";
import { BusinessDayBar } from "../BusinessDayBar";
import { cn } from "../ui/cn";
import { Icon } from "./icons";

interface MobileTopBarProps {
  pushed: PushedRoute | null;
}

export function MobileTopBar({ pushed }: MobileTopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  if (pushed) {
    const { fallback, title } = pushed;
    // "default" is the key of the very first entry in the session. Anything
    // else means there's an in-app screen to go back to; without one (deep
    // link, refresh) pop to the section instead of leaving the app.
    function goBack() {
      if (location.key !== "default") {
        navigate(-1);
      } else {
        navigate(fallback, { replace: true });
      }
    }

    return (
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface-raised pl-1 pr-4 md:hidden">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-card border-0 bg-transparent text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          )}
        >
          <Icon name="back" />
        </button>
        <span className="font-heading text-section font-semibold text-ink">{title}</span>
      </header>
    );
  }

  return (
    <header className="shrink-0 border-b border-border bg-surface-raised md:hidden">
      <div className="flex h-12 items-center px-4">
        {/* Compact, same max-height + object-contain approach as the sidebar —
            visible here on every non-detail screen, not tucked into "More". */}
        <BrandLogo size={22} />
      </div>
      {/* BusinessDayBar renders nothing for roles without business-day access;
          empty:hidden collapses the strip instead of leaving a blank bordered bar. */}
      <div className="border-t border-border px-4 py-2 empty:hidden">
        <BusinessDayBar />
      </div>
    </header>
  );
}
