import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 768px)";

const mql = typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY) : null;

function subscribe(cb: () => void) {
  mql?.addEventListener("change", cb);
  return () => mql?.removeEventListener("change", cb);
}

function getSnapshot() {
  return mql?.matches ?? false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
