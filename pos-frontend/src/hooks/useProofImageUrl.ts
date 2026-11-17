import { useEffect, useState } from "react";
import { ordersApi } from "../api/orders";

// A guest's payment proof is private: the backend serves it only to a signed-in staff member, and an
// <img src> can't send the Authorization header. So the image is fetched with the app's authenticated
// client and shown from an object URL (revoked when no longer needed). `proofMediaId` is in the
// dependencies so a replaced proof is fetched again.
export function useProofImageUrl(
  orderId: string,
  proofMediaId: string | null,
  size: "thumb" | "full",
  enabled = true,
): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>({
    key: "",
    url: null,
    failed: false,
  });
  const key = `${orderId}:${proofMediaId}:${size}`;

  useEffect(() => {
    if (!enabled || proofMediaId === null) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    ordersApi
      .getPaymentProof(orderId, size)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ key, url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ key, url: null, failed: true });
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [orderId, proofMediaId, size, enabled, key]);

  // Ignore a result that belongs to a previous order/proof/size.
  return state.key === key ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}
