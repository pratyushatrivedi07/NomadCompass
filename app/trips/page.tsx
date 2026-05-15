"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Calendar, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrency } from "@/lib/cities";
import { toast } from "sonner";

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

  const fetchTrips = () => {
    supabase
      .from("trips")
      .select(
        "id, share_slug, city, days, budget, travel_style, created_at, itinerary",
      )
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }: { data: any }) => {
        setTrips(data ?? []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTrips();
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
            <svg height="22" viewBox="0 0 24 24" width="22">
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                fill="#1a73e8"
              />
            </svg>
            <span
              className="text-lg font-medium text-[#202124]"
              style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
            >
              ExploreAI
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
                className="flex items-center gap-4 rounded-2xl border border-[#dadce0] bg-white p-4 animate-pulse"
              >
                {/* Icon skeleton */}
                <div className="w-12 h-12 rounded-xl bg-[#e8eaed] shrink-0" />

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
                className="flex items-center gap-4 rounded-2xl border border-[#dadce0] bg-white p-4 hover:shadow-sm transition group"
              >
                <Link
                  href={`/t/${t.share_slug}`}
                  className="flex-1 flex items-center gap-4"
                >
                  {/* City icon */}
                  <div className="w-12 h-12 rounded-xl bg-[#e8f0fe] flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-[#1a73e8]" />
                  </div>

                  {/* Trip info */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium text-[#202124] capitalize"
                      style={{
                        fontFamily: "'Google Sans', Roboto, sans-serif",
                      }}
                    >
                      {t.city}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#5f6368]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {getDayCount(t)} days
                      </span>
                      <span className="capitalize">{t.budget}</span>
                      <span className="capitalize">{t.travel_style}</span>
                    </div>
                  </div>

                  {/* Cost + date */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium text-[#202124]">
                      {getTripTotal(t)}
                    </div>
                    <div className="text-xs text-[#9aa0a6] mt-0.5">
                      {new Date(t.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </Link>

                {/* Delete button */}
                <button
                  onClick={() => deleteTrip(t.id)}
                  disabled={deleting === t.id}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-full hover:bg-[#fce8e6] text-[#9aa0a6] hover:text-[#ea4335] transition"
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
