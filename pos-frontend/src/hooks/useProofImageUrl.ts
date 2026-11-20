import { useCallback, useEffect, useState } from "react";

// Loads one size of a guest's proof image (a blob from the API).
export type ProofFetcher = (size: "thumb" | "full") => Promise<Blob>;

// A guest's payment proof is private: the backend serves it only to a signed-in staff member, and an
// <img src> can't send the Authorization header. So the image is fetched with the app's authenticated
// client and shown from an object URL, revoked as soon as it is no longer needed: when the key changes,
// on unmount, and when `enabled` turns false (the full-size viewer closing). `ownerKey` names what the
// proof belongs to (an order, a table bill share) and `proofMediaId` is in the key, so a replaced
// proof is fetched again. The fetcher is read when the key changes, not on every render.
export function useProofImageUrl(
  ownerKey: string,
  proofMediaId: string | null,
  fetchProof: ProofFetcher,
  size: "thumb" | "full",
  enabled = true,
): { url: string | null; failed: boolean; retry: () => void } {
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>({
    key: "",
    url: null,
    failed: false,
  });
  const [attempt, setAttempt] = useState(0);
  const key = `${ownerKey}:${proofMediaId}:${size}:${attempt}`;

  useEffect(() => {
    if (!enabled || proofMediaId === null) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchProof(size)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers what the fetcher fetches
  }, [proofMediaId, size, enabled, key]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  // Ignore a result that belongs to a previous order/proof/size/attempt, and never hand back a URL
  // that was revoked when the hook was disabled.
  if (!enabled || state.key !== key) {
    return { url: null, failed: false, retry };
  }
  return { url: state.url, failed: state.failed, retry };
}
