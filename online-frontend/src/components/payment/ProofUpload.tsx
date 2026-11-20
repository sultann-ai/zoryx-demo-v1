import type { UploadOptions } from '../../api/client'
import { ProofFileInput, ProofUploadPanel } from './ProofUploadPanel'
import { useProofUploader } from './useProofUploader'

/**
 * The screenshot picker on its own, for a payment that has no payment card yet (a table guest's share of the bill): the
 * same shrinking, progress, errors and "never a dead end" help as the order's card, wired to whatever `upload` sends.
 */
export function ProofUpload({
  upload,
  onDone,
  whatsappHref,
  callWaiter,
}: {
  upload: (file: File, options: UploadOptions) => Promise<unknown>
  onDone: () => void
  whatsappHref: string | null
  callWaiter?: () => Promise<void>
}) {
  const uploader = useProofUploader({ upload, onUploaded: () => onDone() })
  return (
    <>
      <ProofFileInput inputRef={uploader.inputRef} onPick={uploader.pick} />
      <ProofUploadPanel uploader={uploader} whatsappHref={whatsappHref} callWaiter={callWaiter} />
    </>
  )
}
