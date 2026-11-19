import { useState } from "react";
import { ordersApi } from "../api/orders";
import type { ProofFetcher } from "../hooks/useProofImageUrl";
import { useProofImageUrl } from "../hooks/useProofImageUrl";
import { Modal } from "./ui";

interface ProofImageProps {
  // What the proof belongs to (an order id, a table bill share id): part of the image cache key.
  ownerKey: string;
  // A guest's proof, stored in Postgres (served to staff only). Any value that changes when the
  // guest uploads a new one; null = there is no stored proof.
  proofMediaId: string | null;
  fetchProof: ProofFetcher;
  // Orders placed before proofs moved off local disk keep a path under /uploads.
  legacyScreenshotUrl?: string | null;
}

// A guest's payment screenshot: a small thumbnail that opens full size. Renders nothing when there is
// no proof at all. Used for online orders (Incoming, Order Detail) and for table bill shares.
export function ProofImage({ ownerKey, proofMediaId, fetchProof, legacyScreenshotUrl = null }: ProofImageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const thumb = useProofImageUrl(ownerKey, proofMediaId, fetchProof, "thumb");
  const full = useProofImageUrl(ownerKey, proofMediaId, fetchProof, "full", isOpen);

  const legacyUrl = legacyScreenshotUrl ? `${import.meta.env.VITE_API_URL}${legacyScreenshotUrl}` : null;
  const thumbUrl = proofMediaId !== null ? thumb.url : legacyUrl;
  const fullUrl = proofMediaId !== null ? full.url : legacyUrl;

  if (proofMediaId === null && legacyUrl === null) {
    return null;
  }
  if (proofMediaId !== null && thumb.failed) {
    return <p className="text-meta text-status-danger-text">Could not load the payment proof.</p>;
  }

  return (
    <>
      {thumbUrl ? (
        <button type="button" onClick={() => setIsOpen(true)} className="self-start">
          <img src={thumbUrl} alt="Payment screenshot" className="h-20 w-20 rounded-card border border-border object-cover" />
        </button>
      ) : (
        <span className="text-meta text-ink-muted">Loading payment proof…</span>
      )}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Payment screenshot">
        {fullUrl ? (
          <img src={fullUrl} alt="Payment screenshot, full size" className="max-h-[75vh] w-full rounded-card object-contain" />
        ) : (
          <p className="text-body text-ink-muted">Loading…</p>
        )}
      </Modal>
    </>
  );
}

interface PaymentProofProps {
  orderId: string;
  proofMediaId: string | null;
  legacyScreenshotUrl: string | null;
}

// An order's payment screenshot.
export function PaymentProof({ orderId, proofMediaId, legacyScreenshotUrl }: PaymentProofProps) {
  return (
    <ProofImage
      ownerKey={`order:${orderId}`}
      proofMediaId={proofMediaId}
      fetchProof={(size) => ordersApi.getPaymentProof(orderId, size)}
      legacyScreenshotUrl={legacyScreenshotUrl}
    />
  );
}
