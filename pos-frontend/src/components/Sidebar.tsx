import { NavLink } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { useAuth } from "../context/AuthContext";
import { useIncomingOrdersContext } from "../context/IncomingOrdersContext";
import { useTableCallsContext } from "../context/TableCallsContext";
import type { NavGroup, NavItem, NewTabNavItem } from "../routes/navItems";
import { GROUP_ORDER, NAV_ITEMS, NEW_TAB_NAV_ITEMS } from "../routes/navItems";
import { Icon } from "./shell/icons";
import { NavCountBadge } from "./shell/NavCountBadge";
import { cn } from "./ui/cn";

export function Sidebar() {
  const { staff } = useAuth();
  // Two destinations carry a count — orders waiting at reception and waiter calls nobody has
  // answered (on Tables) — special-cased here rather than giving NavItem a generic badge field.
  const { count: incomingOrdersCount } = useIncomingOrdersContext();
  const { badgeCount: openCallsCount } = useTableCallsContext();

  const visibleItems = staff ? NAV_ITEMS.filter((item) => item.allowedRoles.includes(staff.role)) : [];
  const visibleNewTabItems = staff ? NEW_TAB_NAV_ITEMS.filter((item) => item.allowedRoles.includes(staff.role)) : [];
  const newTabByGroup = new Map<NavGroup, NewTabNavItem[]>();
  for (const item of visibleNewTabItems) {
    newTabByGroup.set(item.group, [...(newTabByGroup.get(item.group) ?? []), item]);
  }

  const itemsByGroup = new Map<NavGroup, NavItem[]>();
  for (const item of visibleItems) {
    const bucket = itemsByGroup.get(item.group);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByGroup.set(item.group, [item]);
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col border-r border-border bg-surface-raised">
      {/* max-height + object-contain rather than a fixed box: whatever shape the
          real logo turns out to be (wide wordmark, square mark, tall lockup), it
          scales to fit without ever being stretched or cropped. */}
      <div className="flex shrink-0 items-center justify-center border-b border-border px-5 py-4">
        <BrandLogo size={26} />
      </div>
      {/* The one scroll area of the sidebar: min-h-0 lets this flex child shrink below its
          content height (without it the nav grew past the viewport and its bottom items were
          cut off), overscroll-contain stops a scroll at the end chaining into the page, and the
          bottom padding keeps the last item clear of the edge on short screens. */}
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-6 [scrollbar-width:thin]">
        {GROUP_ORDER.map((group) => {
          const items = itemsByGroup.get(group) ?? [];
          const newTabItems = newTabByGroup.get(group) ?? [];
          if (items.length === 0 && newTabItems.length === 0) {
            return null;
          }
          return (
            <div key={group} className="mb-4 last:mb-0">
              <div className="px-3 pb-1 text-meta font-medium text-ink-muted">{group}</div>
              <ul className="flex list-none flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      // Exact match only when another entry lives under this path (Tables vs
                      // Table layout), so "/tables/layout" doesn't light up both. Everything else
                      // keeps matching its detail pages ("/orders/123" still highlights Orders).
                      end={visibleItems.some((other) => other.to.startsWith(`${item.to}/`))}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-card border-l-2 px-3 py-2 text-body font-medium no-underline transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                          isActive
                            ? "border-accent bg-surface text-accent font-semibold"
                            : "border-transparent text-ink-muted hover:bg-surface hover:text-ink",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* The forest-green accent is already "primary actions, links, focus
                              rings, active nav marker" per the plan — reused here for the
                              active icon too, not a new color introduced for this. */}
                          <span className={isActive ? "text-accent" : "text-ink-muted"}>
                            <Icon name={item.icon} />
                          </span>
                          <span className="flex-1">{item.label}</span>
                          {item.to === "/incoming-orders" && incomingOrdersCount > 0 && (
                            <NavCountBadge count={incomingOrdersCount} tone="warning" label={`${incomingOrdersCount} waiting`} />
                          )}
                          {item.to === "/tables" && openCallsCount > 0 && (
                            <NavCountBadge count={openCallsCount} tone="danger" label={`${openCallsCount} waiting for a waiter`} />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
                {newTabItems.map((item) => (
                  <li key={item.to}>
                    <a
                      href={item.to}
                      target="_blank"
                      rel="noopener"
                      className={cn(
                        "flex items-center gap-2.5 rounded-card border-l-2 border-transparent px-3 py-2 text-body font-medium text-ink-muted no-underline transition-colors hover:bg-surface hover:text-ink",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                      )}
                    >
                      <span className="text-ink-muted">
                        <Icon name={item.icon} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      <span className="text-meta text-ink-muted" aria-label="opens in a new tab">
                        ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
