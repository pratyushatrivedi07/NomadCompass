import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved My Trips — Nomad's Compass",
};

export default function TripsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
