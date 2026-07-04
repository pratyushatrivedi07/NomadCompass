import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Trip Itinerary — Nomad's Compass",
};

export default function TripLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
