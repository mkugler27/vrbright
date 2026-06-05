// Exported for use in services — import and call this instead of console.error
export function reportError(msg: string) {
  window.dispatchEvent(new CustomEvent('app-error', { detail: msg }));
}