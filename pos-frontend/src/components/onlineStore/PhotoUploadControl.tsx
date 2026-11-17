import { useRef } from "react";
import type { MediaKind, UploadedMedia } from "../../api/media";
import { Button } from "../ui";
import { UploadProgress } from "./UploadProgress";
import { usePhotoUpload } from "./usePhotoUpload";

interface PhotoUploadControlProps {
  kind: MediaKind;
  hasPhoto: boolean;
  // Called once the photo is stored. Attach it to the item/deal/QR here; a failure is shown under the button.
  onUploaded: (media: UploadedMedia) => Promise<unknown> | void;
  // A QR code stays lossless PNG so it still scans.
  outputType?: "image/jpeg" | "image/png";
  disabled?: boolean;
  className?: string;
}

// "Upload photo" / "Replace photo". The file input has no `capture` attribute on purpose: on a phone that
// makes the browser offer both the camera and the photo gallery.
export function PhotoUploadControl({ kind, hasPhoto, onUploaded, outputType, disabled, className }: PhotoUploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, upload, isBusy } = usePhotoUpload(kind, outputType);

  async function handleChosen(files: FileList | null) {
    const file = files?.[0];
    // Reset so choosing the same file again (after an error) still fires onChange.
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (file) {
      await upload(file, onUploaded);
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleChosen(event.target.files)}
      />
      <Button variant="secondary" className="w-full" onClick={() => inputRef.current?.click()} disabled={disabled || isBusy}>
        {hasPhoto ? "Replace photo" : "Upload photo"}
      </Button>
      <div className="mt-1.5 empty:hidden">
        <UploadProgress state={state} />
      </div>
    </div>
  );
}
