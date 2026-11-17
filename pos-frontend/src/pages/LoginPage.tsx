import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { getApiErrorMessage } from "../api/errors";
import { BrandLogo } from "../components/BrandLogo";
import type { AuthStaff } from "../auth/session";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "../components/ui";
import { getHomeRoute } from "../routes/homeRoute";

interface LoginResponse {
  token: string;
  staff: AuthStaff;
}

// Room on the left for the icon, plus a stronger focus state than the shared
// field default: the border turns accent and a wider ring appears.
const fieldFocusClasses =
  "pl-10 hover:border-ink-muted focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/25";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function LoginPage() {
  const { isAuthenticated, staff, login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated && staff) {
    return <Navigate to={getHomeRoute(staff.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/api/pos/auth/login", {
        username,
        password,
      });
      login({ staff: data.staff, token: data.token });
      navigate(getHomeRoute(data.staff.role), { replace: true });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Failed to log in"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface-raised p-6 shadow-lg sm:p-8">
        {/* Larger than the sidebar's mark, same max-height + object-contain
            approach so it's never stretched or cropped. */}
        <div className="mb-4 flex justify-center">
          <BrandLogo size={40} />
        </div>
        <p className="mb-6 text-center text-body text-ink-muted">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-meta font-medium text-ink-muted">
              Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                <UserIcon />
              </span>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                className={fieldFocusClasses}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-meta font-medium text-ink-muted">
              Password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                <LockIcon />
              </span>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className={fieldFocusClasses}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-body text-status-danger-text">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="mt-2 w-full shadow-sm hover:border-ink hover:bg-ink hover:shadow-md"
          >
            {isSubmitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
