import { useEffect, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { ordersApi } from "../api/orders";
import type { ProofFetcher } from "../hooks/useProofImageUrl";
import { useProofImageUrl } from "../hooks/useProofImageUrl";
import { Button, Modal } from "./ui";
import { LIGHTBOX_BACKDROP_ATTR } from "./ui/Modal";

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

// A guest's payment screenshot: a small thumbnail that opens full size in a lightbox. Renders nothing
// when there is no proof at all. Used for online orders (Incoming, Order Detail) and for table bill
// shares — the one place a payment proof is shown.
export function ProofImage({ ownerKey, proofMediaId, fetchProof, legacyScreenshotUrl = null }: ProofImageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const thumb = useProofImageUrl(ownerKey, proofMediaId, fetchProof, "thumb");
  // Fetched only while the viewer is open; its object URL is revoked when it closes.
  const full = useProofImageUrl(ownerKey, proofMediaId, fetchProof, "full", isOpen);

  const legacyUrl = legacyScreenshotUrl ? `${import.meta.env.VITE_API_URL}${legacyScreenshotUrl}` : null;
  const thumbUrl = proofMediaId !== null ? thumb.url : legacyUrl;
  const fullUrl = proofMediaId !== null ? full.url : legacyUrl;

  if (proofMediaId === null && legacyUrl === null) {
    return null;
  }
  if (proofMediaId !== null && thumb.failed) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-meta text-status-danger-text">Could not load the payment proof.</span>
        <Button variant="secondary" onClick={thumb.retry}>
          Try again
        </Button>
      </span>
    );
  }

  return (
    <>
      {thumbUrl ? (
        <button
          ref={openerRef}
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open payment screenshot"
          className="self-start cursor-zoom-in rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <img src={thumbUrl} alt="Payment screenshot" className="h-20 w-20 rounded-card border border-border object-cover" />
        </button>
      ) : (
        <span className="text-meta text-ink-muted">Loading payment proof…</span>
      )}
      <Modal
        variant="lightbox"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Payment screenshot"
        returnFocusRef={openerRef}
      >
        <ProofViewer
          url={fullUrl}
          failed={proofMediaId !== null && full.failed}
          onRetry={full.retry}
        />
      </Modal>
    </>
  );
}

// The most a pinch can magnify, relative to the image's own pixel size.
const MAX_ZOOM_OF_NATURAL = 3;

interface ProofViewerProps {
  url: string | null;
  failed: boolean;
  onRetry: () => void;
}

// The full-size image inside the lightbox: fitted to the screen, tap/click to toggle between fitted and
// the image's real pixel size, pinch to zoom on a phone (the browser's own pinch is turned off here so
// the X stays put), scroll/drag to pan when zoomed. Loading and error states included.
function ProofViewer({ url, failed, onRetry }: ProofViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Re-mounts the <img> on retry (a legacy URL doesn't change between attempts).
  const [imageAttempt, setImageAttempt] = useState(0);
  // Which image (url + attempt) finished loading or failed; anything else is still loading.
  const [outcome, setOutcome] = useState<{ key: string; result: "loaded" | "error" } | null>(null);
  const imageKey = `${url}#${imageAttempt}`;
  const status = outcome?.key === imageKey ? outcome.result : "loading";
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  // 1 = fitted to the screen.
  const [zoom, setZoom] = useState(1);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const fitScale = natural && box ? Math.min(box.width / natural.width, box.height / natural.height, 1) : 1;
  // "Full size" = the image's real pixels; a screenshot that already fits still doubles, so a tap always
  // does something.
  const fullZoom = fitScale < 1 ? 1 / fitScale : 2;
  const maxZoom = Math.max(fullZoom, MAX_ZOOM_OF_NATURAL / fitScale);
  const isZoomed = zoom > 1.01;
  const size = natural ? { width: natural.width * fitScale * zoom, height: natural.height * fitScale * zoom } : null;

  const toggleZoom = () => {
    if (Date.now() < suppressClickUntil.current) {
      return;
    }
    setZoom(isZoomed ? 1 : fullZoom);
  };

  const touchDistance = (event: TouchEvent) => {
    const [a, b] = [event.touches[0], event.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      pinch.current = { distance: touchDistance(event), zoom };
    }
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 2 || !pinch.current) {
      return;
    }
    const next = pinch.current.zoom * (touchDistance(event) / pinch.current.distance);
    setZoom(Math.min(Math.max(next, 1), maxZoom));
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (pinch.current && event.touches.length < 2) {
      pinch.current = null;
      // The finger that lifts last would otherwise count as a tap and toggle the zoom.
      suppressClickUntil.current = Date.now() + 400;
    }
  };

  const backdrop = { [LIGHTBOX_BACKDROP_ATTR]: "" };

  return (
    <div
      ref={containerRef}
      {...backdrop}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      // pan only: pinch is handled above, so the browser doesn't zoom the whole page (and the X) instead.
      className="flex min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-4 [touch-action:pan-x_pan-y]"
    >
      {failed || status === "error" ? (
        <div className="m-auto flex max-w-xs flex-col items-center gap-3 rounded-card bg-surface-raised p-5 text-center">
          <p className="text-body text-ink">The payment screenshot didn't load. Check the connection and try again.</p>
          <Button
            onClick={() => {
              if (failed) {
                onRetry();
              }
              setImageAttempt((current) => current + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          {(url === null || status === "loading") && (
            <p role="status" className="m-auto text-body text-white">
              Loading screenshot…
            </p>
          )}
          {url !== null && (
            <img
              key={imageAttempt}
              src={url}
              alt="Payment screenshot, full size"
              draggable={false}
              onLoad={(event) => {
                setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                setOutcome({ key: imageKey, result: "loaded" });
              }}
              onError={() => setOutcome({ key: imageKey, result: "error" })}
              onClick={toggleZoom}
              style={size ? { width: size.width, height: size.height } : undefined}
              // m-auto centres it when it fits and still lets it scroll from its top-left edge when it doesn't.
              className={
                status === "loaded"
                  ? `m-auto max-w-none shrink-0 select-none rounded-card bg-surface-raised ${isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`
                  : "hidden"
              }
            />
          )}
        </>
      )}
    </div>
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
