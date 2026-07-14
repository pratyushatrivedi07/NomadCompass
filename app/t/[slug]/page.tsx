"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Loader2, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrency } from "@/lib/cities";
import type { Itinerary } from "@/lib/types";
import { StopCard } from "@/components/StopCard";
import { NomadCompassLogo } from "@/components/NomadCompassLogo";
import { track } from "@/lib/analytics";

const NomadCompass = dynamic(
  () => import("@/components/NomadCompass").then((m) => m.NomadCompass),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#f1f3f4] animate-pulse" />,
  },
);

export default function SharedTripPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetTouchY = useRef(0);
  const hasEngaged = useRef(false);

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
          track("shared_trip_not_found", { slug });
          return;
        }
        track("shared_trip_viewed", { slug, city: data.city });
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
    <div
      className="relative h-[100dvh] md:flex md:flex-row md:overflow-hidden"
      style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
    >
      {/* Map — full viewport on mobile, flex-1 on desktop */}
      <div className="absolute inset-0 z-0 md:relative md:order-2 md:flex-1 md:h-full min-w-0">
        <NomadCompass
          stops={day.stops}
          activeIndex={activeStop}
          onSelect={(i) => {
            setActiveStop(i);
            setSheetExpanded(true);
          }}
          city={meta?.city}
        />
      </div>

      {/* Bottom sheet (mobile) / Sidebar (desktop) */}
      <aside
        className={`
          mobile-sheet fixed bottom-0 left-0 right-0 z-10 flex flex-col bg-white
          rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)]
          transition-[max-height] duration-300 ease-in-out overflow-hidden
          ${sheetExpanded ? "max-h-[85dvh]" : "max-h-[35dvh]"}
          md:relative md:order-1 md:z-auto md:rounded-none md:shadow-lg md:border-r md:border-[#dadce0]
          md:max-h-none md:flex-shrink-0 md:w-[380px] md:max-w-[380px]
        `}
      >
        {/* Drag handle — mobile only */}
        <div
          className="md:hidden flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0"
          onClick={() => setSheetExpanded((v) => !v)}
          onTouchStart={(e) => {
            sheetTouchY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            const delta = sheetTouchY.current - e.changedTouches[0].clientY;
            if (Math.abs(delta) > 40)
              setSheetExpanded(delta > 0);
          }}
        >
          <div className="w-10 h-1.5 rounded-full bg-[#dadce0]" />
        </div>

        {/* Header */}
        <header className="flex items-center gap-2 px-3 py-2 md:py-3 border-b border-[#dadce0] shrink-0">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-[#f1f3f4] rounded-full transition flex items-center justify-center"
          >
            <ChevronLeft className="h-5 w-5 text-[#5f6368]" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <NomadCompassLogo size={28} />
            <div className="min-w-0">
              <span className="text-xs mb-1 font-medium text-[#1a73e8] leading-none block">
                Nomad's Compass
              </span>
              <h1 className="text-[15px] font-medium text-[#202124] capitalize leading-tight truncate">
                {meta?.city}
              </h1>
            </div>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              (itinerary as any)?._sharedAt
                ? "bg-[#e6f4ea] text-[#137333]"
                : "bg-[#f1f3f4] text-[#9aa0a6]"
            }`}
          >
            {(itinerary as any)?._sharedAt ? "Shared" : "Saved"}
          </span>
        </header>

        {/* Day tabs */}
        <div className="flex border-b border-[#dadce0] px-2 overflow-x-auto">
          {itinerary.days.map((d) => (
            <button
              key={d.day}
              onClick={() => {
                setActiveDay(d.day);
                setActiveStop(null);
                if (!hasEngaged.current) {
                  hasEngaged.current = true;
                  track("shared_trip_engaged", { slug, city: meta?.city, action: "day_switch" });
                }
              }}
              className={`px-3 py-3 text-sm font-medium transition border-b-2 -mb-px shrink-0 ${
                activeDay === d.day
                  ? "border-[#1a73e8] text-[#1a73e8]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124]"
              }`}
            >
              Day {d.day}
            </button>
          ))}
        </div>

        {/* Stops */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {day.theme && (
            <div className="text-[11px] uppercase tracking-widest font-medium text-[#5f6368] pb-2">
              {day.theme}
            </div>
          )}
          {day.stops.map((stop, i) => (
            <StopCard
              key={`${stop.name}-${i}`}
              stop={stop}
              index={i}
              active={activeStop === i}
              onClick={() => {
                setActiveStop(i);
                if (!hasEngaged.current) {
                  hasEngaged.current = true;
                  track("shared_trip_engaged", { slug, city: meta?.city, action: "stop_click" });
                }
              }}
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
    </div>
  );
}
