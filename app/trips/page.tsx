"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Calendar, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrency } from "@/lib/cities";
import { toast } from "sonner";
import { NomadCompassLogo } from "@/components/NomadCompassLogo";
import { track } from "@/lib/analytics";

type Trip = {
  id: string;
  share_slug: string;
  city: string;
  days: number;
  budget: string;
  travel_style: string;
  created_at: string;
  itinerary: any;
};

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    track("trips_list_viewed");
    supabase
      .from("trips")
      .select(
        "id, share_slug, city, days, budget, travel_style, created_at, itinerary",
      )
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }: { data: any }) => {
        const loaded = data ?? [];
        setTrips(loaded);
        setLoading(false);
        track("trips_list_loaded", { trip_count: loaded.length });
      });
  }, []);

  const deleteTrip = async (id: string) => {
    if (!confirm("Delete this trip?")) return;

    setDeleting(id);

    const { error } = await supabase.from("trips").delete().eq("id", id);

    if (error) {
      toast.error(error.message);
      setDeleting(null);
      return;
    }

    setTrips((prev) => prev.filter((t) => t.id !== id));

    toast.success("Trip deleted");
    setDeleting(null);
  };

  const getTripTotal = (trip: Trip) => {
    const currency = getCurrency(trip.city);
    const total =
      trip.itinerary?.trip_total_cost ??
      trip.itinerary?.days?.reduce(
        (s: number, d: any) => s + (d.daily_total_cost ?? 0),
        0,
      ) ??
      0;
    return `${currency.symbol}${total.toFixed(0)}`;
  };

  const getDayCount = (trip: Trip) => {
    return trip.itinerary?.days?.length ?? trip.days;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white border-b border-[#dadce0] sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <NomadCompassLogo />
            <span
              className="text-lg font-medium text-[#202124]"
              style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
            >
              Nomad's Compass
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[#1a73e8] hover:bg-[#e8f0fe] px-4 py-2 rounded-full transition"
          >
            + Plan new trip
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1
          className="text-2xl font-medium text-[#202124] mb-6"
          style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
        >
          My Trips
        </h1>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-[#dadce0] bg-white p-3 md:p-4 animate-pulse"
              >
                {/* Icon skeleton */}
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#e8eaed] shrink-0" />

                {/* Text skeleton */}
                <div className="flex-1 min-w-0">
                  <div className="h-4 w-40 rounded bg-[#e8eaed]" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-3 w-16 rounded bg-[#e8eaed]" />
                    <div className="h-3 w-20 rounded bg-[#e8eaed]" />
                    <div className="h-3 w-24 rounded bg-[#e8eaed]" />
                  </div>
                </div>

                {/* Price/date skeleton */}
                <div className="text-right shrink-0">
                  <div className="h-4 w-16 rounded bg-[#e8eaed] ml-auto" />
                  <div className="h-3 w-20 rounded bg-[#e8eaed] mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border border-[#dadce0] bg-white p-12 text-center">
            <MapPin className="mx-auto mb-4 h-10 w-10 text-[#9aa0a6]" />
            <p className="text-[#5f6368] mb-4">No saved trips yet.</p>
            <Link
              href="/"
              className="inline-block bg-[#1a73e8] text-white text-sm font-medium px-6 py-2.5 rounded-full hover:bg-[#1557b0] transition"
            >
              Plan your first trip
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((t) => (
              <div
                key={t.id}
                className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 rounded-2xl border border-[#dadce0] bg-white p-3.5 md:p-4 hover:shadow-sm transition group relative"
              >
                {/* Mobile Top Header Row: City + Pill + Delete Icon */}
                <div className="flex items-center justify-between gap-2 md:hidden">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* City Icon (Mobile) */}
                    <div className="w-10 h-10 rounded-xl bg-[#e8f0fe] flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-[#1a73e8]" />
                    </div>

                    {/* City & Reduced Pill */}
                    <div
                      className="flex items-center gap-1.5 font-semibold text-[#202124] text-base capitalize min-w-0"
                      style={{
                        fontFamily: "'Google Sans', Roboto, sans-serif",
                      }}
                    >
                      <span className="truncate">{t.city}</span>
                    </div>
                  </div>

                  {/* Delete Button (Mobile Header Inline) */}
                  <button
                    onClick={() => deleteTrip(t.id)}
                    disabled={deleting === t.id}
                    className="p-2 rounded-full bg-gray-50 hover:bg-[#fce8e6] text-[#9aa0a6] hover:text-[#ea4335] transition shrink-0"
                    title="Delete trip"
                  >
                    {deleting === t.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Main Content Component Area */}
                <Link
                  href={`/t/${t.share_slug}`}
                  className="flex-1 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 min-w-0"
                >
                  {/* Desktop-Only City Icon */}
                  <div className="hidden md:flex w-14 h-14 rounded-xl bg-[#e8f0fe] flex items-center justify-center shrink-0 self-center">
                    <MapPin className="h-6 w-6 text-[#1a73e8]" />
                  </div>

                  {/* Info Layout Split Grid */}
                  <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                    {/* Text and Meta Tags */}
                    <div className="flex flex-col space-y-1 min-w-0">
                      {/* Desktop-Only Header Row */}
                      <div
                        className="hidden md:flex items-center gap-2 font-medium text-[#202124] capitalize text-base"
                        style={{
                          fontFamily: "'Google Sans', Roboto, sans-serif",
                        }}
                      >
                        <span className="truncate">{t.city}</span>
                      </div>

                      {/* Meta Tags Details */}
                      <div className="flex items-center gap-1.5 text-xs text-[#5f6368] flex-wrap pl-1 md:pl-0">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-[#70757a]" />
                        <span className="shrink-0">{getDayCount(t)} days</span>
                        <span>·</span>
                        <span className="capitalize shrink-0">{t.budget}</span>
                        <span>·</span>
                        <span className="capitalize shrink-0">
                          {t.travel_style}
                        </span>
                        <span>·</span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 tracking-wide ${
                            t.itinerary?._sharedAt
                              ? "bg-[#e6f4ea] text-[#137333]"
                              : "bg-[#e8f0fe] text-[#1a73e8]"
                          }`}
                        >
                          {t.itinerary?._sharedAt ? "Shared" : "Saved"}
                        </span>
                      </div>
                    </div>

                    {/* Pricing and Date Row */}
                    {/* Mobile: Horizontal footer row layout | Desktop: Vertical stack aligned right */}
                    <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center shrink-0 pt-2.5 md:pt-0 border-t border-[#f1f3f4] md:border-none pl-1 md:pl-0">
                      <div className="text-base md:text-sm font-semibold text-[#202124]">
                        {getTripTotal(t)}
                      </div>

                      <div className="text-xs text-[#9aa0a6] md:mt-1">
                        {new Date(t.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Desktop-Only Hover Reveal Delete Button */}
                <button
                  onClick={() => deleteTrip(t.id)}
                  disabled={deleting === t.id}
                  className="hidden md:block md:opacity-0 md:group-hover:opacity-100 p-2 rounded-full hover:bg-[#fce8e6] text-[#9aa0a6] hover:text-[#ea4335] transition shrink-0 self-center"
                  title="Delete trip"
                >
                  {deleting === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
