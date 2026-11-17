import { useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getShellNav } from "../../routes/mobileShell";
import { cn } from "../ui/cn";
import { Icon } from "./icons";
import { MoreMenu } from "./MoreMenu";

// 64px tall, edge to edge: well past the plan's 44px minimum, since these are
// the most-tapped controls on a phone. The focus ring is inset because
// neighbouring tabs would clip an offset one. Preflight is skipped app-wide,
// so the <a> tabs need no-underline explicitly (see MORE_BUTTON_RESET for the
// one <button> tab).
const TAB_CLASSES =
  "flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 px-1 text-meta font-medium no-underline transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

// A <button> keeps the browser's grey fill, 2px outset border and system font
// unless told otherwise. Only the top border is wanted (the active bar).
const MORE_BUTTON_RESET = "border-x-0 border-b-0 bg-transparent font-body";

function tabState(isActive: boolean): string {
  // Colour is never the only signal: the active tab also gets a top bar and heavier text.
  return isActive ? "border-accent font-semibold text-accent" : "border-transparent text-ink-muted";
}

export function BottomTabBar() {
  const { staff, logout } = useAuth();
  const { pathname } = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  if (!staff) {
    return null;
  }

  const { tabs, more } = getShellNav(staff.role);
  const isMoreActive = more.some((destination) => matchPath({ path: destination.to, end: false }, pathname));

  return (
    <>
      <nav aria-label="Primary" className="flex shrink-0 border-t border-border bg-surface-raised md:hidden">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => cn(TAB_CLASSES, tabState(isActive))}>
            <Icon name={tab.icon} />
            <span className="max-w-full truncate">{tab.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          aria-haspopup="dialog"
          className={cn(TAB_CLASSES, MORE_BUTTON_RESET, tabState(isMoreActive))}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>

      <MoreMenu
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        destinations={more}
        staffName={staff.name}
        onLogout={logout}
      />
    </>
  );
}
