declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Fire a GA4 custom event via the gtag snippet in app/layout.tsx.
 * No-ops when gtag isn't loaded (GA ID unset, ad blocker, SSR).
 */
export function track(
  event: string,
  params?: Record<string, string | number | boolean>,
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  try {
    window.gtag("event", event, params ?? {});
  } catch {
    // Analytics must never break the app.
  }
}
