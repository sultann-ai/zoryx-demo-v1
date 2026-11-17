import { NavLink, Outlet } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { useAuth } from "../context/AuthContext";
import { TakerOrdersProvider, useTakerOrdersContext } from "../context/TakerOrdersContext";
import { Button } from "./ui";
import { cn } from "./ui/cn";
import { Icon } from "./shell/icons";

const TAB_CLASSES =
  "flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-t-2 px-1 text-meta font-medium no-underline transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

function tabState(isActive: boolean): string {
  return isActive ? "border-accent font-semibold text-accent" : "border-transparent text-ink-muted";
}

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  live: "bg-status-success",
  reconnecting: "bg-status-warning",
  offline: "bg-status-danger",
};

function ConnectionPill() {
  const { connectionStatus } = useTakerOrdersContext();
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT_CLASS[connectionStatus])} aria-hidden="true" />
      {STATUS_LABEL[connectionStatus]}
    </span>
  );
}

function TakerTopBar() {
  const { staff, logout } = useAuth();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-raised px-4">
      <div className="flex items-center gap-3">
        <BrandLogo size={22} />
        <ConnectionPill />
      </div>
      <div className="flex items-center gap-3">
        {staff && <span className="text-body text-ink-muted">{staff.name}</span>}
        <Button variant="secondary" onClick={logout}>
          Log out
        </Button>
      </div>
    </header>
  );
}

function TakerBottomNav() {
  return (
    <nav aria-label="Primary" className="flex shrink-0 border-t border-border bg-surface-raised">
      <NavLink to="/take-order" end className={({ isActive }) => cn(TAB_CLASSES, tabState(isActive))}>
        <Icon name="newOrder" />
        <span>New order</span>
      </NavLink>
      <NavLink to="/my-orders" className={({ isActive }) => cn(TAB_CLASSES, tabState(isActive))}>
        <Icon name="list" />
        <span>My orders</span>
      </NavLink>
    </nav>
  );
}

// ORDER_TAKER's own standalone shell — no sidebar, no AppLayout, same "own shell, no
// shared nav" treatment KITCHEN gets. Owns the one socket connection/chime (via
// TakerOrdersProvider) so both /take-order and /my-orders share one connection state.
export function TakerShell() {
  return (
    <TakerOrdersProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-surface max-md:h-dvh">
        <TakerTopBar />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
        <TakerBottomNav />
      </div>
    </TakerOrdersProvider>
  );
}
