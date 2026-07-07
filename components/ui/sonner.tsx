"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      richColors
      position="top-center"
      offset={60}
      closeButton
      // --width is used by Sonner's CSS; the mobile media query overrides
      // per-toast width to 100% so this only applies on desktop
      style={{ "--width": "440px" } as React.CSSProperties}
    />
  );
}
