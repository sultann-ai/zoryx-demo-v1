import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

// GET /api/pos/app-info — public, so the login page can ask too. Only what the shell needs before
// anyone signs in: whether this install is a demo (the "DEMO" pill in the logo and on receipts).
export interface AppInfo {
  isDemo: boolean;
}

export function useAppInfo() {
  return useQuery({
    queryKey: ["app-info"],
    queryFn: async () => (await apiClient.get<AppInfo>("/api/pos/app-info")).data,
    staleTime: Infinity,
  });
}

// False until the answer arrives (and if it can't be had): a real shop never flashes "DEMO".
export function useIsDemo(): boolean {
  return useAppInfo().data?.isDemo === true;
}
