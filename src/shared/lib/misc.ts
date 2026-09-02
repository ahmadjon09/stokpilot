/** Haptic feedback (Vibration API) */
export function buzz(ms = 10): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* noop */
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('sp-toast', { detail: message }));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
