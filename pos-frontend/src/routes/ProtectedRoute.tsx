import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { StaffRole } from "../auth/session";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: StaffRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, staff } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !staff) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
