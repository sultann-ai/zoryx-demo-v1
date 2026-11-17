import { useState } from "react";
import { useProofImageUrl } from "../hooks/useProofImageUrl";
import { Modal } from "./ui";

interface PaymentProofProps {
  orderId: string;
  // A guest's proof, stored in Postgres (served to staff only).
  proofMediaId: string | null;
  // Orders placed before proofs moved off local disk keep a path under /uploads.
  legacyScreenshotUrl: string | null;
}

// The payment screenshot on an order: a small thumbnail that opens full size. Renders nothing when
// there is no proof at all.
export function PaymentProof({ orderId, proofMediaId, legacyScreenshotUrl }: PaymentProofProps) {
  const [isOpen, setIsOpen] = useState(false);
  const thumb = useProofImageUrl(orderId, proofMediaId, "thumb");
  const full = useProofImageUrl(orderId, proofMediaId, "full", isOpen);

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
