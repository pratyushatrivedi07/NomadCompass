"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Loader2, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrency } from "@/lib/cities";
import type { Itinerary } from "@/lib/types";
import { StopCard } from "@/components/StopCard";
import { JourneyGenieLogo } from "@/components/JourneyGenieLogo";

const JourneyGenie = dynamic(
  () => import("@/components/JourneyGenie").then((m) => m.JourneyGenie),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#f1f3f4] animate-pulse" />,
  },
);

export default function SharedTripPage() {
  const { slug } = useParams<{ slug: string }>();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("trips")
      .select("*")
      .eq("share_slug", slug)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const itin = data.itinerary as unknown as Itinerary;
        setItinerary(itin);
        if (itin?.days?.length) setActiveDay(itin.days[0].day);
        setMeta({
          city: data.city,
          days: data.days,
          budget: data.budget,
          travelStyle: data.travel_style,
        });
        setLoading(false);
      });
  }, [slug]);

  const day =
    itinerary?.days.find((d) => d.day === activeDay) ?? itinerary?.days[0];
  const currency = meta ? getCurrency(meta.city) : { symbol: "£" };
  const tripTotal =
    itinerary?.days.reduce((s, d) => s + (d.daily_total_cost ?? 0), 0) ?? 0;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#1a73e8]" />
      </div>
    );
  }

  if (notFound || !itinerary || !day) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-[#5f6368]">Trip not found.</p>
        <Link href="/" className="text-[#1a73e8] underline">
          Plan your own trip
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <aside
        className="flex w-full flex-col bg-white md:w-[380px] md:max-w-[380px] shadow-lg"
        style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[#dadce0]">
          <Link
            href="/"
            className="p-2 hover:bg-[#f1f3f4] rounded-full transition"
          >
            <ChevronLeft className="h-5 w-5 text-[#5f6368]" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <JourneyGenieLogo />
              <span className="text-sm font-medium text-[#1a73e8]">Maps</span>
            </div>
            <h1 className="text-base font-medium text-[#202124] capitalize">
              {meta?.city}
            </h1>
          </div>
          <span className="text-xs text-[#9aa0a6] bg-[#f1f3f4] px-2 py-1 rounded-full">
            Shared
          </span>
        </header>

        {/* Day tabs */}
        <div className="flex border-b border-[#dadce0] px-4 overflow-x-auto">
          {itinerary.days.map((d) => (
            <button
              key={d.day}
              onClick={() => {
                setActiveDay(d.day);
                setActiveStop(null);
              }}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 -mb-px shrink-0 ${
                activeDay === d.day
                  ? "border-[#1a73e8] text-[#1a73e8]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Day {d.day}
            </button>
          ))}
        </div>

        {/* Theme */}
        {day.theme && (
          <div className="px-4 pt-3 text-[11px] uppercase tracking-widest font-medium text-[#5f6368]">
            {day.theme}
          </div>
        )}

        {/* Stops */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {day.stops.map((stop, i) => (
            <StopCard
              key={i}
              stop={stop}
              index={i}
              active={activeStop === i}
              onClick={() => setActiveStop(i)}
              currencySymbol={currency.symbol}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[#dadce0] bg-white p-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-[#5f6368]">Daily estimate</span>
            <span className="font-medium text-[#202124]">
              {currency.symbol}
              {day.daily_total_cost?.toFixed(2) ?? "0.00"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mb-4">
            <span className="text-[#5f6368]">Trip total</span>
            <span className="font-medium text-[#202124]">
              {currency.symbol}
              {tripTotal.toFixed(2)}
            </span>
          </div>
          <Link
            href="/"
            className="block w-full text-center bg-[#1a73e8] text-white text-sm font-medium py-2.5 rounded-full hover:bg-[#1557b0] transition"
          >
            Plan my own trip →
          </Link>
        </div>
      </aside>

      <div className="relative h-[50vh] flex-1 md:h-auto">
        <JourneyGenie
          stops={day.stops}
          activeIndex={activeStop}
          onSelect={setActiveStop}
          city={meta?.city}
        />
      </div>
    </div>
  );
}
