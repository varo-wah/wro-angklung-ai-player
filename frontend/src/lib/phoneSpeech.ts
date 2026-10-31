/** Phone/tablet replies stay textual; playback must not wait for mobile TTS callbacks. */
export function phoneSpeechDisabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
