import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, type UploadOptions } from '../../api/client'
import { vibrate } from '../../lib/haptics'
import { canvasCodec } from '../../lib/proofCanvas'
import { PROOF_TYPES, prepareProof, type ProofFailure } from '../../lib/proofImage'
import { showToast } from '../../lib/toast'
import { useT } from '../../i18n'

/** What went wrong, in terms the screen answers (every one keeps the chosen picture, except NOT_IMAGE which has none). */
export type UploadError =
  | { kind: 'NOT_IMAGE' }
  /** Too big after compression, or the phone could not compress it and the original does not fit: three ways out. */
  | { kind: 'UNSENDABLE'; reason: Exclude<ProofFailure, 'NOT_IMAGE'> }
  | { kind: 'NETWORK' }
  | { kind: 'OFFLINE' }
  | { kind: 'RATE'; message: string }
  | { kind: 'SERVER'; message?: string }
  | { kind: 'GONE' }

export interface ProofUploader {
  /** The hidden file input every picker button opens; render it once with <ProofFileInput>. */
  inputRef: React.RefObject<HTMLInputElement | null>
  openPicker: () => void
  pick: (file: File | undefined) => void
  /** The picture chosen (the original, for the thumbnail), and whether it is ready to send. */
  picked: File | null
  ready: boolean
  previewUrl: string | null
  /** Getting the picture ready, or sending it. */
  preparing: boolean
  uploading: boolean
  busy: boolean
  /** 0..1 while sending, null when the browser reports nothing yet. */
  progress: number | null
  error: UploadError | null
  /** navigator.onLine, live. */
  online: boolean
  send: () => void
  /** Stop a send in progress; the picture stays chosen. */
  cancel: () => void
  /** Forget the picture and any error. */
  reset: () => void
}

/**
 * The upload of one payment screenshot: choose, shrink in the browser (lib/proofImage), send with progress, and every way
 * it can fail. It never decides what the payment is: success only calls `onUploaded` (the page then re-reads the server's
 * state), and any failure leaves the page where it was, with the picture kept for "Try again".
 */
export function useProofUploader({
  upload,
  onUploaded,
}: {
  upload: (file: File, options: UploadOptions) => Promise<unknown>
  /** Called with the server's answer when it took the picture, and with nothing when it says the payment moved on. */
  onUploaded: (result?: unknown) => void
}): ProofUploader {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [prepared, setPrepared] = useState<File | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<UploadError | null>(null)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const lock = useRef(false) // a second tap while one send runs does nothing
  const controller = useRef<AbortController | null>(null)
  const pickId = useRef(0) // a late answer for an older pick is ignored

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // A temporary address for the thumbnail, released when the picture changes.
  const previewUrl = useMemo(() => (picked ? URL.createObjectURL(picked) : null), [picked])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const pick = useCallback((file: File | undefined) => {
    if (!file || lock.current) return
    const id = ++pickId.current
    setError(null)
    setPrepared(null)
    setPicked(file)
    setPreparing(true)
    void prepareProof(file, canvasCodec).then((result) => {
      if (id !== pickId.current) return
      setPreparing(false)
      if (result.ok) return setPrepared(result.file)
      if (result.reason === 'NOT_IMAGE') {
        setPicked(null)
        setError({ kind: 'NOT_IMAGE' })
      } else setError({ kind: 'UNSENDABLE', reason: result.reason })
    })
  }, [])

  const send = useCallback(() => {
    if (!prepared || lock.current) return
    // Offline: keep the picture and say so. A second tap tries anyway (browsers sometimes report offline wrongly).
    if (typeof navigator !== 'undefined' && navigator.onLine === false && error?.kind !== 'OFFLINE') {
      setError({ kind: 'OFFLINE' })
      return
    }
    lock.current = true
    const abort = new AbortController()
    controller.current = abort
    setError(null)
    setProgress(null)
    setUploading(true)
    upload(prepared, { onProgress: setProgress, signal: abort.signal })
      .then((result) => {
        setPicked(null)
        setPrepared(null)
        vibrate([15, 40, 15])
        showToast({ message: t('proof.toast.sent'), kind: 'success' })
        onUploaded(result)
      })
      .catch((failure: unknown) => {
        if (failure instanceof DOMException && failure.name === 'AbortError') return // cancelled on purpose
        if (failure instanceof ApiError) {
          if (failure.status === 0) return setError({ kind: navigator.onLine === false ? 'OFFLINE' : 'NETWORK' })
          if (failure.status === 409) {
            setError({ kind: 'GONE' })
            return onUploaded() // the order moved on meanwhile: the page re-reads it
          }
          if (failure.status === 429) return setError({ kind: 'RATE', message: failure.message })
          if (failure.status < 500) return setError({ kind: 'SERVER', message: failure.message })
        }
        setError({ kind: 'SERVER' })
      })
      .finally(() => {
        lock.current = false
        controller.current = null
        setUploading(false)
        setProgress(null)
      })
  }, [prepared, upload, onUploaded, error, t])

  const cancel = useCallback(() => controller.current?.abort(), [])

  const reset = useCallback(() => {
    if (lock.current) return
    pickId.current += 1
    setPicked(null)
    setPrepared(null)
    setPreparing(false)
    setError(null)
  }, [])

  const openPicker = useCallback(() => {
    if (lock.current) return
    inputRef.current?.click()
  }, [])

  return {
    inputRef,
    openPicker,
    pick,
    picked,
    ready: prepared !== null,
    previewUrl,
    preparing,
    uploading,
    busy: preparing || uploading,
    progress,
    error,
    online,
    send,
    cancel,
    reset,
  }
}

/** The `accept` of the file input behind every "choose a screenshot" button. */
export const PROOF_ACCEPT = PROOF_TYPES.join(',')
