import { useAuth } from "../context/AuthContext";
import { useSiteSettings } from "../hooks/useOnlineStore";

// "Max 20% of the items" under a discount input — shown to a POS Admin only, the one role the cap
// (Store settings, Super Admin only) applies to. The server enforces it either way; this just
// saves a refused try.
export function DiscountCapHint() {
  const { staff } = useAuth();
  const isCapped = staff?.role === "POS_ADMIN";
  const { data: settings } = useSiteSettings({ enabled: isCapped });
  if (!isCapped || !settings) {
    return null;
  }
  return <span className="text-meta text-ink-muted">Max {Number(settings.maxDiscountPercentPosAdmin)}% of the items</span>;
}
