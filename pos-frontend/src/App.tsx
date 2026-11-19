import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { StaffRole } from "./auth/session";
import { AppLayout } from "./components/AppLayout";
import { TakerShell } from "./components/TakerShell";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { KitchenDisplayPage } from "./pages/KitchenDisplayPage";
import { LoginPage } from "./pages/LoginPage";
import { MyOrdersPage } from "./pages/MyOrdersPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { PrintKitchenTicketsPage } from "./pages/PrintKitchenTicketsPage";
import { PrintReceiptPage } from "./pages/PrintReceiptPage";
import { QrSheetPage } from "./pages/QrSheetPage";
import { TablesPage } from "./pages/TablesPage";
import { TakerCallsPage } from "./pages/TakerCallsPage";
import { TakeOrderPage } from "./pages/TakeOrderPage";
import { VendorDetailPage } from "./pages/VendorDetailPage";
import { getHomeRoute } from "./routes/homeRoute";
import { NAV_ITEMS } from "./routes/navItems";
import { ProtectedRoute } from "./routes/ProtectedRoute";

// Orders sub-routes (new/detail/print) aren't in NAV_ITEMS — only "Orders" itself
// should appear in the sidebar — but they share its role restriction.
const ORDERS_STAFF_ROLES: StaffRole[] = ["SUPER_ADMIN", "POS_ADMIN"];

// Vendor detail isn't in NAV_ITEMS either — only "Vendor Ledger" itself is — but
// shares its role restriction.
const VENDOR_STAFF_ROLES: StaffRole[] = ["SUPER_ADMIN", "POS_ADMIN"];

const queryClient = new QueryClient();

function RootRedirect() {
  const { isAuthenticated, staff } = useAuth();
  if (!isAuthenticated || !staff) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={getHomeRoute(staff.role)} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RootRedirect />} />

      {/* KITCHEN accounts only ever see the Kitchen Display — no shared app shell/nav for them,
          so this route sits outside the AppLayout below. A KITCHEN account sees its own kitchen only;
          SUPER_ADMIN/POS_ADMIN open it from the sidebar (new tab) and pick a kitchen or "All kitchens". */}
      <Route
        path="/kitchen-display"
        element={
          <ProtectedRoute allowedRoles={["KITCHEN", "SUPER_ADMIN", "POS_ADMIN"]}>
            <KitchenDisplayPage />
          </ProtectedRoute>
        }
      />

      {/* ORDER_TAKER accounts only ever see these routes (new order, my orders, the floor map, waiter calls), under their own shell
          (TakerShell) — no sidebar/AppLayout, same "no shared app shell" treatment as
          KITCHEN above. Any other URL bounces here via the "/" -> RootRedirect ->
          getHomeRoute chain, since ORDER_TAKER has no NAV_ITEMS entry to fall back to. */}
      <Route element={<ProtectedRoute allowedRoles={["ORDER_TAKER"]}><TakerShell /></ProtectedRoute>}>
        <Route path="/take-order" element={<TakeOrderPage />} />
        <Route path="/my-orders" element={<MyOrdersPage />} />
        <Route path="/taker-tables" element={<TablesPage />} />
        <Route path="/taker-calls" element={<TakerCallsPage />} />
      </Route>

      {/* Print views are standalone too — a clean printable page, no sidebar/top bar. */}
      <Route
        path="/orders/:id/print/receipt"
        element={
          <ProtectedRoute allowedRoles={ORDERS_STAFF_ROLES}>
            <PrintReceiptPage />
          </ProtectedRoute>
        }
      />
      {/* Table QR cards (A4 sheet or 10 x 15 cm tents): standalone for the same reason. */}
      <Route
        path="/tables/qr-sheet"
        element={
          <ProtectedRoute allowedRoles={["SUPER_ADMIN", "POS_ADMIN"]}>
            <QrSheetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:id/print/kitchen-tickets"
        element={
          <ProtectedRoute allowedRoles={ORDERS_STAFF_ROLES}>
            <PrintKitchenTicketsPage />
          </ProtectedRoute>
        }
      />

      <Route element={<AppLayout />}>
        {NAV_ITEMS.map(({ to, allowedRoles, page: Page }) => (
          <Route
            key={to}
            path={to}
            element={
              <ProtectedRoute allowedRoles={allowedRoles}>
                <Page />
              </ProtectedRoute>
            }
          />
        ))}
        <Route
          path="/orders/new"
          element={
            <ProtectedRoute allowedRoles={ORDERS_STAFF_ROLES}>
              <NewOrderPage />
            </ProtectedRoute>
          }
        />
        {/* Edit the items of a still-SCHEDULED order — the New Order screen in edit mode. */}
        <Route
          path="/scheduled/:id/edit"
          element={
            <ProtectedRoute allowedRoles={ORDERS_STAFF_ROLES}>
              <NewOrderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute allowedRoles={ORDERS_STAFF_ROLES}>
              <OrderDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendors/:id"
          element={
            <ProtectedRoute allowedRoles={VENDOR_STAFF_ROLES}>
              <VendorDetailPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
