import { Outlet, useLocation } from "react-router-dom";
import { IncomingOrdersProvider } from "../context/IncomingOrdersContext";
import { getPushedRoute } from "../routes/mobileShell";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./shell/BottomTabBar";
import { MobileTopBar } from "./shell/MobileTopBar";

// Two shells in one layout, switched by CSS at the md breakpoint (768px):
//   md and up  - sidebar + top bar, exactly as before.
//   below md   - app bar on top, bottom tab bar underneath. A "pushed" route
//                (list -> detail, see routes/mobileShell.ts) swaps the app bar
//                for a back arrow and drops the tab bar, so it reads as a
//                full-screen view.
export function AppLayout() {
  const { pathname } = useLocation();
  const pushed = getPushedRoute(pathname);

  return (
    // IncomingOrdersProvider wraps the whole shell (not just <Outlet />) so its badge
    // count reaches Sidebar/BottomTabBar too, not only whatever page is currently routed.
    <IncomingOrdersProvider>
      {/* h-screen (100vh) as before on desktop. On phones 100vh is taller than the
          visible area while the browser's address bar is showing, which would push
          the bottom tab bar off screen — so use dynamic viewport height there. */}
      {/* fixed inset-0: exactly the visible viewport, and the containing block for every absolutely
          positioned descendant (the sr-only helpers, popovers). Without a positioned ancestor those
          escaped to the page, stretching the document to thousands of pixels and adding a second,
          page-level scrollbar behind the sidebar and <main>. Now the only scrollers are the
          sidebar's nav and <main>. */}
      <div className="fixed inset-0 flex overflow-hidden bg-surface">
        <div className="hidden min-h-0 md:flex">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="hidden md:block">
            <TopBar />
          </div>
          <MobileTopBar pushed={pushed} />
          <main className="flex-1 overflow-y-auto p-4 max-md:overflow-x-hidden md:p-6">
            {/* The wrapper exists only for pushed routes: keyed by pathname so
                entering a detail view replays the slide-in. Ordinary screens
                render <Outlet /> directly, with exactly the DOM they had before
                this shell existed. */}
            {pushed ? (
              <div key={pathname} className="relative max-md:motion-safe:animate-push-in">
                <Outlet />
              </div>
            ) : (
              <Outlet />
            )}
          </main>
          {!pushed && <BottomTabBar />}
        </div>
      </div>
    </IncomingOrdersProvider>
  );
}
