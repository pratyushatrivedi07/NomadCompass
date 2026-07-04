import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Itinerary — Nomad's Compass",
};

export default function SharedTripLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
