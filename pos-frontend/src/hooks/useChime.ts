import { useCallback, useEffect, useRef, useState } from "react";

// A short two-tone chime synthesized with the Web Audio API — no audio asset, no new
// dependency. Browsers block audio before a user gesture, so the AudioContext is
// created lazily on first use and resumed by the caller's "tap to enable sound" banner
// if it comes back suspended. Shared by IncomingOrdersContext (reception) and the
// order-taker shell (TakerShell) — built once here for IncomingOrdersContext first,
// extracted so a second consumer doesn't duplicate it.
function playChime(audioContext: AudioContext): void {
  const now = audioContext.currentTime;
  for (const [index, frequency] of [880, 1320].entries()) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    const start = now + index * 0.16;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  }
}

function getStoredMuted(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

function setStoredMuted(storageKey: string, muted: boolean): void {
  try {
    localStorage.setItem(storageKey, String(muted));
  } catch {
    // Private-browsing/storage-blocked — mute just won't persist across reloads.
  }
}

export interface UseChimeResult {
  chime: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  needsUnlock: boolean;
  unlock: () => void;
}

// `storageKey` is per-screen (reception vs. order-taker mute separately — different
// devices, different people), so callers pass their own localStorage key.
export function useChime(storageKey: string): UseChimeResult {
  const [isMuted, setIsMuted] = useState(() => getStoredMuted(storageKey));
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      setStoredMuted(storageKey, !prev);
      return !prev;
    });
  }, [storageKey]);

  function ensureAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }
    return audioContextRef.current;
  }

  function chime() {
    if (isMuted) {
      return;
    }
    const audioContext = ensureAudioContext();
    if (!audioContext) {
      return;
    }
    if (audioContext.state === "suspended") {
      setNeedsUnlock(true);
      return;
    }
    playChime(audioContext);
  }

  function unlock() {
    const audioContext = ensureAudioContext();
    if (!audioContext) {
      return;
    }
    audioContext.resume().then(() => setNeedsUnlock(false));
  }

  useEffect(() => {
    if (!needsUnlock) {
      return;
    }
    function handlePointerDown() {
      unlock();
    }
    window.addEventListener("pointerdown", handlePointerDown, { once: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsUnlock]);

  return { chime, isMuted, toggleMute, needsUnlock, unlock };
}
