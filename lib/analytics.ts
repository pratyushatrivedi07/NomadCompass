import { sendGAEvent } from "@next/third-parties/google";

/**
 * Fire a GA4 custom event. No-ops when NEXT_PUBLIC_GA_ID is unset
 * (local dev without analytics) or when gtag is blocked by the client.
 */
export function track(
  event: string,
  params?: Record<string, string | number | boolean>,
) {
  if (!process.env.NEXT_PUBLIC_GA_ID) return;
  try {
    sendGAEvent("event", event, params ?? {});
  } catch {
    // Analytics must never break the app.
  }
}
