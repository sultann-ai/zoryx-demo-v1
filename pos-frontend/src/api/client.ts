import axios from "axios";
import { clearStoredSession, getStoredToken } from "../auth/session";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Only treat this as "session expired" when the failed request actually
      // carried a token — otherwise a wrong-password login attempt (also a
      // 401, but unauthenticated) would wrongly bounce the user to /login.
      const hadToken = Boolean(error.config?.headers?.Authorization);
      if (hadToken) {
        clearStoredSession();
        window.dispatchEvent(new Event("auth:logout"));
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
      }
    }
    return Promise.reject(error);
  },
);
