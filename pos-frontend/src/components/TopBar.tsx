import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";
import { BusinessDayBar } from "./BusinessDayBar";

export function TopBar() {
  const { staff, logout } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface-raised px-6">
      {/* Slot for Business Day status/controls. */}
      <BusinessDayBar />
      <div className="flex items-center gap-3">
        {staff && <span className="text-body text-ink-muted">{staff.name}</span>}
        <Button variant="secondary" onClick={logout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
