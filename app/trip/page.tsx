"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  Plus,
  Save,
  Loader2,
  Copy,
  Share2,
  MoreVertical,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StopCard } from "@/components/StopCard";
import type { Itinerary, Stop } from "@/lib/types";
import { getCurrency } from "@/lib/cities";
import { supabase } from "@/lib/supabase";
import { haversineKm } from "@/lib/utils";
import { toast } from "sonner";
import { NomadCompassLogo } from "@/components/NomadCompassLogo";
import { track } from "@/lib/analytics";

const NomadCompass = dynamic(
  () => import("@/components/NomadCompass").then((m) => m.NomadCompass),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#f1f3f4] animate-pulse" />,
  },
);

type Stored = {
  meta: {
    city: string;
    days: number;
    budget: string;
    travelStyle: string;
    mustVisit: string[];
  };
  itinerary: Itinerary;
};

export default function TripPage() {
  const router = useRouter();
  const [data, setData] = useState<Stored | null>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"save" | "share" | null>(null);
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newStopName, setNewStopName] = useState("");
  const [nominatimResults, setNominatimResults] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [showMenu, setShowMenu] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const sidebarRef = useRef<HTMLElement>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetTouchY = useRef(0);

  useEffect(() => {
    const raw = sessionStorage.getItem("nomadCompass:current");
    if (!raw) {
      router.push("/");
      return;
    }
    setData(JSON.parse(raw));
  }, [router]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(
        600,
        Math.max(300, startWidth + ev.clientX - startX),
      );
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const day = useMemo(
    () =>
      data?.itinerary.days.find((d) => d.day === activeDay) ??
      data?.itinerary.days[0],
    [data, activeDay],
  );

  const tripTotal = useMemo(
    () =>
      data?.itinerary.days.reduce((s, d) => s + (d.daily_total_cost ?? 0), 0) ??
      0,
    [data],
  );

  const currency = useMemo(
    () => (data ? getCurrency(data.meta.city) : { symbol: "£", code: "GBP" }),
    [data],
  );

  const persist = (next: Stored) => {
    setData(next);
    sessionStorage.setItem("nomadCompass:current", JSON.stringify(next));
  };

  const removeStop = (idx: number) => {
    if (!data || !day) return;
    const newDays = data.itinerary.days.map((d) =>
      d.day !== day.day
        ? d
        : {
            ...d,
            stops: d.stops.filter((_, i) => i !== idx),
            daily_total_cost: recalcDay(d.stops.filter((_, i) => i !== idx)),
          },
    );
    persist({ ...data, itinerary: { ...data.itinerary, days: newDays } });
    setActiveStop(null);
    track("stop_removed", { city: data.meta.city, day: day.day });
  };

  const searchNominatim = async (query: string) => {
    setNewStopName(query);
    if (query.length < 3) {
      setNominatimResults([]);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + " " + (data?.meta.city ?? ""))}&format=json&limit=5`,
        { headers: { "User-Agent": "NomadCompass/1.0" } },
      );
      setNominatimResults(await res.json());
    } catch {
      setNominatimResults([]);
    }
  };

  const addStopFromNominatim = (r: {
    display_name: string;
    lat: string;
    lon: string;
  }) => {
    if (!data || !day) return;
    const newLat = parseFloat(r.lat);
    const newLng = parseFloat(r.lon);
    const lastStop = day.stops[day.stops.length - 1];
    const distKm = lastStop
      ? haversineKm(lastStop.lat, lastStop.lng, newLat, newLng)
      : 0;
    const mode = distKm < 0.8 ? "walk" : distKm < 5 ? "bus" : "metro";
    const newStop: Stop = {
      name: r.display_name.split(",")[0].trim(),
      type: "attraction",
      lat: newLat,
      lng: newLng,
      duration_mins: 60,
      entry_cost: 0,
      transport_from_previous: {
        mode,
        line: null,
        from_stop: null,
        to_stop: null,
        fare: mode === "walk" ? 0 : 2.5,
        walk_to_stop_mins:
          mode === "walk" ? Math.round((distKm * 1000) / 80) : 5,
      },
    };
    const newDays = data.itinerary.days.map((d) =>
      d.day !== day.day
        ? d
        : {
            ...d,
            stops: [...d.stops, newStop],
            daily_total_cost: recalcDay([...d.stops, newStop]),
          },
    );
    persist({ ...data, itinerary: { ...data.itinerary, days: newDays } });
    setNewStopName("");
    setNominatimResults([]);
    setAddingFor(null);
    track("stop_added", { city: data.meta.city, day: day.day });
  };

  const save = async () => {
    if (!data) return;
    if (shareUrl) {
      setModalMode("save");
      return;
    }
    setSaving(true);
    try {
      const { data: row, error } = await supabase
        .from("trips")
        .insert({
          city: data.meta.city,
          days: data.meta.days,
          budget: data.meta.budget,
          travel_style: data.meta.travelStyle,
          must_visit: data.meta.mustVisit,
          itinerary: data.itinerary as never,
        })
        .select("share_slug")
        .single();
      if (error) throw error;
      const url = `${window.location.origin}/t/${row.share_slug}`;
      setShareUrl(url);
      setModalMode("save");
      track("itinerary_saved", {
        city: data.meta.city,
        days: data.meta.days,
        budget: data.meta.budget,
        travel_style: data.meta.travelStyle,
      });
    } catch (e) {
      track("save_failed", { city: data.meta.city });
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    track("share_clicked", { city: data?.meta.city ?? "" });
    if (!shareUrl) {
      await save();
      setModalMode("share");
      return;
    }
    setModalMode("share");
  };

  if (!data || !day) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#1a73e8]" />
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
          city={data.meta.city}
        />
      </div>

      {/* Bottom sheet (mobile) / Sidebar (desktop) */}
      <aside
        ref={sidebarRef}
        className={`
          mobile-sheet fixed bottom-0 left-0 right-0 z-10 flex flex-col bg-white
          rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)]
          transition-[max-height] duration-300 ease-in-out overflow-hidden
          ${sheetExpanded ? "max-h-[85dvh]" : "max-h-[35dvh]"}
          md:relative md:order-1 md:z-auto md:rounded-none md:shadow-lg md:border-r md:border-[#dadce0]
          md:max-h-none md:flex-shrink-0
        `}
        style={{ minWidth: 300, maxWidth: 600, width: sidebarWidth }}
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
          <Link
            href="/"
            className="p-2 hover:bg-[#f1f3f4] rounded-full transition flex items-center justify-center"
          >
            <ChevronLeft className="h-5 w-5 text-[#5f6368]" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <NomadCompassLogo size={28} />
            <div className="min-w-0">
              <span className="text-xs mb-1 font-medium text-[#1a73e8] leading-none block">
                Nomad's Compass
              </span>
              <h1 className="text-[15px] font-medium text-[#202124] capitalize leading-tight truncate">
                {data.meta.city}
              </h1>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-[#f1f3f4] rounded-full transition"
            >
              <MoreVertical className="h-5 w-5 text-[#5f6368]" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-[#dadce0] z-50 overflow-hidden">
                <Link
                  href="/trips"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-[#202124] hover:bg-[#f1f3f4]"
                >
                  Saved itineraries
                </Link>
                <Link
                  href="/"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-[#202124] hover:bg-[#f1f3f4]"
                >
                  Plan new trip
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* City + meta */}
        <div className="px-4 pt-2 pb-0">
          <p className="text-xs text-[#5f6368]">
            {data.meta.days} days · {data.meta.budget} · {data.meta.travelStyle}
          </p>
        </div>

        {/* Day tabs */}
        <div className="flex border-b border-[#dadce0] px-2 overflow-x-auto shrink-0">
          {data.itinerary.days.map((d) => (
            <button
              key={d.day}
              onClick={() => {
                setActiveDay(d.day);
                setActiveStop(null);
              }}
              className={`px-3 py-3 text-sm font-medium transition border-b-2 -mb-px shrink-0 ${
                activeDay === d.day
                  ? "border-[#1a73e8] text-[#1a73e8]"
                  : "border-transparent text-[#5f6368] hover:text-[#202124] hover:bg-[#f8f9fa]"
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
              key={i}
              stop={stop}
              index={i}
              active={activeStop === i}
              onClick={() => setActiveStop(i)}
              onRemove={() => removeStop(i)}
              currencySymbol={currency.symbol}
            />
          ))}

          {/* Add stop */}
          {addingFor === day.day ? (
            <div className="rounded-xl border border-[#dadce0] bg-white p-3 mt-2">
              <div className="relative">
                <input
                  value={newStopName}
                  onChange={(e) => searchNominatim(e.target.value)}
                  placeholder="Search for a place…"
                  className="w-full border border-[#dadce0] rounded-lg px-3 py-2.5 text-sm text-[#202124] placeholder:text-[#9aa0a6] focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] bg-white"
                  autoFocus
                />
                {nominatimResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-[#dadce0] bg-white shadow-lg overflow-hidden">
                    {nominatimResults.map((r, idx) => (
                      <button
                        key={idx}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f1f3f4] transition border-b border-[#f1f3f4] last:border-0"
                        onClick={() => addStopFromNominatim(r)}
                      >
                        <svg
                          className="mt-0.5 shrink-0 text-[#5f6368]"
                          height="16"
                          viewBox="0 0 24 24"
                          width="16"
                          fill="currentColor"
                        >
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-[#202124]">
                            {r.display_name.split(",")[0]}
                          </div>
                          <div className="text-xs text-[#5f6368]">
                            {r.display_name
                              .split(",")
                              .slice(1, 3)
                              .join(",")
                              .trim()}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setAddingFor(null);
                  setNewStopName("");
                  setNominatimResults([]);
                }}
                className="mt-2 w-full text-sm text-[#5f6368] py-1.5 hover:bg-[#f1f3f4] rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingFor(day.day)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#dadce0] py-3 text-sm text-[#1a73e8] hover:bg-[#e8f0fe] transition mt-2"
            >
              <Plus className="h-4 w-4" /> Add a stop
            </button>
          )}
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
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 border border-[#dadce0] text-[#1a73e8] text-sm font-medium py-2.5 rounded-full hover:bg-[#e8f0fe] transition disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a73e8] text-white text-sm font-medium py-2.5 rounded-full hover:bg-[#1557b0] transition"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
        </div>

        <div
          onMouseDown={startResize}
          className="hidden md:flex absolute right-0 top-0 bottom-0 w-3 cursor-col-resize items-center justify-center group z-10"
        >
          <div className="w-0.5 h-10 bg-[#dadce0] group-hover:bg-[#1a73e8] group-hover:w-1 rounded-full transition-all" />
        </div>
      </aside>

      {/* Modal */}
      <Dialog open={!!modalMode} onOpenChange={(o) => !o && setModalMode(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
            >
              {modalMode === "save" ? "Itinerary saved! 🎉" : "Share your trip"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "save"
                ? "Your itinerary has been saved."
                : "Anyone with this link can view your trip."}
            </DialogDescription>
          </DialogHeader>

          {modalMode === "save" && (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => router.push("/trips")}
                className="w-full border border-[#dadce0] text-[#1a73e8] text-sm font-medium py-2.5 rounded-full hover:bg-[#e8f0fe] transition"
              >
                View My Trips
              </button>
              <button
                onClick={() => setModalMode("share")}
                className="w-full bg-[#1a73e8] text-white text-sm font-medium py-2.5 rounded-full hover:bg-[#1557b0] transition flex items-center justify-center gap-2"
              >
                <Share2 className="h-4 w-4" /> Share itinerary
              </button>
            </div>
          )}

          {modalMode === "share" && shareUrl && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  value={shareUrl}
                  readOnly
                  className="flex-1 text-xs font-mono border border-[#dadce0] rounded-lg px-3 py-2 bg-[#f1f3f4] text-[#202124] outline-none"
                />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    toast.success("Link copied!");
                    track("share_link_copied", { city: data.meta.city });
                  }}
                  className="flex items-center gap-1.5 bg-[#1a73e8] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#1557b0] transition"
                >
                  <Copy className="h-4 w-4" /> Copy
                </button>
              </div>
              <button
                onClick={() =>
                  router.push(shareUrl.replace(window.location.origin, ""))
                }
                className="w-full text-sm text-[#1a73e8] py-2 hover:bg-[#e8f0fe] rounded-full transition"
              >
                Open shared view →
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function recalcDay(stops: Stop[]) {
  return stops.reduce(
    (sum, s) =>
      sum +
      (s.entry_cost ?? 0) +
      (s.transport_from_previous?.fare ??
        (s.transport_from_previous as any)?.cost ??
        0),
    0,
  );
}
