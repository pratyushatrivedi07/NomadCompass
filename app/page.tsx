"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Bus, Footprints, Shuffle, ArrowRight } from "lucide-react";
import { getBudgetRanges } from "@/lib/cities";
import { toast } from "sonner";
import { NomadCompassLogo } from "@/components/NomadCompassLogo";
import { track } from "@/lib/analytics";

const styles = [
  { id: "public", icon: Bus, label: "Public Transport" },
  { id: "walking", icon: Footprints, label: "Walking" },
  { id: "mixed", icon: Shuffle, label: "Mixed" },
] as const;

const cities = [
  { name: "London", flag: "🇬🇧" },
  { name: "Paris", flag: "🇫🇷" },
  { name: "Rome", flag: "🇮🇹" },
  { name: "Amsterdam", flag: "🇳🇱" },
  { name: "Tokyo", flag: "🇯🇵" },
  { name: "New York", flag: "🇺🇸" },
  { name: "Dubai", flag: "🇦🇪" },
  { name: "Singapore", flag: "🇸🇬" },
  { name: "Sydney", flag: "🇦🇺" },
  { name: "Delhi", flag: "🇮🇳" },
];

const loadingMessages = [
  "Mapping your trip…",
  "Finding the best stops…",
  "Sorting transport options…",
  "Almost ready…",
];

/**
 * Merges a base className with a disabled-state class.
 * Keeps all layout/border/text styles intact — just layers opacity + cursor on top.
 * This fixes the bug where the ternary was replacing the whole className string,
 * stripping border/bg/text styles from disabled buttons.
 */
function cx(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

const DISABLED_OVERLAY = "opacity-50 cursor-not-allowed pointer-events-none";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [city, setCity] = useState("");
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState<"budget" | "mid" | "comfort" | null>(
    null,
  );
  const [travelStyle, setTravelStyle] = useState<
    "public" | "walking" | "mixed" | null
  >(null);
  const [mustVisit, setMustVisit] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const budgetRanges = useMemo(() => getBudgetRanges(city), [city]);
  const budgets = [
    { id: "budget", label: "Budget", sub: budgetRanges.budget, emoji: "🎒" },
    { id: "mid", label: "Mid-range", sub: budgetRanges.mid, emoji: "🏨" },
    { id: "comfort", label: "Comfort", sub: budgetRanges.comfort, emoji: "✈️" },
  ] as const;

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(
      () => setLoadingMsgIdx((i) => (i + 1) % loadingMessages.length),
      1800,
    );
    return () => clearInterval(id);
  }, [loading]);

  const submit = async () => {
    if (!city.trim() || !budget || !travelStyle) return;
    setLoading(true);
    setIsGenerating(true);

    track("generate_clicked", {
      city: city.trim(),
      days,
      budget,
      travel_style: travelStyle,
      has_must_visit: mustVisit.trim().length > 0,
    });
    const startedAt = Date.now();

    try {
      const mustVisitList = mustVisit
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);

      const res = await fetch("/api/generate-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim(),
          days,
          budget,
          travelStyle,
          mustVisit: mustVisitList,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        // ── spike: all Gemini models overloaded ──────────────────────────────
        if (err.error === "spike" || res.status === 503) {
          track("generate_failed", { city: city.trim(), error_type: "spike" });
          toast.error(
            "AI models are experiencing a spike in traffic. Please try again in a moment.",
            {
              duration: 12_000, // 12 s — prominent but not forever
              id: "gemini-spike", // deduplicate if user hammers the button
            },
          );
          return; // keep form unlocked so they can retry
        }

        // ── rate limit ───────────────────────────────────────────────────────
        if (res.status === 429) {
          track("generate_failed", {
            city: city.trim(),
            error_type: "rate_limit",
          });
          toast.error(
            "You've hit today's generation limit. Come back tomorrow or try again later.",
            { duration: 12_000 },
          );
          return;
        }

        // ── generic error ────────────────────────────────────────────────────
        throw new Error(
          err.message ?? "Couldn't generate itinerary — please try again.",
        );
      }

      const result = await res.json();
      track("generate_succeeded", {
        city: city.trim(),
        days,
        budget,
        travel_style: travelStyle,
        duration_ms: Date.now() - startedAt,
      });
      sessionStorage.setItem(
        "nomadCompass:current",
        JSON.stringify({
          meta: {
            city: city.trim(),
            days,
            budget,
            travelStyle,
            mustVisit: mustVisitList,
          },
          itinerary: result,
        }),
      );
      router.push("/trip");
    } catch (e) {
      track("generate_failed", { city: city.trim(), error_type: "generic" });
      toast.error(
        `${e instanceof Error ? e.message : "Couldn't generate itinerary — please try again."}`,
        { duration: 12_000 },
      );
    } finally {
      // Re-enable the form whether we errored or navigated away.
      // On success, the router.push unmounts this component anyway.
      setLoading(false);
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-white"
      style={{ fontFamily: "'Google Sans', Roboto, sans-serif" }}
    >
      {/* Header */}
      <header className="border-b border-[#dadce0] bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <NomadCompassLogo />
            <span className="text-lg font-medium text-[#202124]">
              Nomad's Compass
            </span>
          </div>
          <Link
            href="/trips"
            className="text-sm font-medium text-[#5f6368] hover:text-[#1a73e8] hover:bg-[#e8f0fe] px-3 py-1.5 rounded-full transition"
          >
            My Trips
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-medium text-[#202124] tracking-tight">
            Plan your perfect trip
          </h1>
          <p className="mt-2 text-[#5f6368]">
            A few quick questions and we'll map it for you.
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-[#dadce0] bg-white p-8 shadow-sm">
          {/* ── Step 1 — City ─────────────────────────────────────────────── */}
          <Step n={1} title="Where are you going?" locked={isGenerating}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cities.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    setCity(c.name.toLowerCase());
                    setBudget(null);
                    setStep((s) => Math.max(s, 2));
                    track("city_selected", { city: c.name.toLowerCase() });
                  }}
                  disabled={isGenerating}
                  className={cx(
                    // ── base styles (always applied) ──
                    `flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition
                     ${
                       city === c.name.toLowerCase()
                         ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                         : "border-[#dadce0] text-[#202124] hover:bg-[#f1f3f4]"
                     }`,
                    // ── disabled overlay (layered on top, never replaces) ──
                    isGenerating ? DISABLED_OVERLAY : undefined,
                  )}
                >
                  <span className="text-base">{c.flag}</span>
                  <span className="font-medium">{c.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#9aa0a6]">
              More cities coming soon.
            </p>
          </Step>

          {/* ── Step 2 — Days ─────────────────────────────────────────────── */}
          {step >= 2 && (
            <Step n={2} title="How many days?" locked={isGenerating}>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setDays(Math.max(1, days - 1))}
                  disabled={isGenerating}
                  className={cx(
                    "w-9 h-9 rounded-full border border-[#dadce0] text-[#5f6368] hover:bg-[#f1f3f4] flex items-center justify-center text-lg transition",
                    isGenerating ? DISABLED_OVERLAY : undefined,
                  )}
                >
                  −
                </button>
                <div className="min-w-12 text-center text-2xl font-medium text-[#202124] tabular-nums">
                  {days}
                </div>
                <button
                  onClick={() => setDays(Math.min(5, days + 1))}
                  disabled={isGenerating}
                  className={cx(
                    "w-9 h-9 rounded-full border border-[#dadce0] text-[#5f6368] hover:bg-[#f1f3f4] flex items-center justify-center text-lg transition",
                    isGenerating ? DISABLED_OVERLAY : undefined,
                  )}
                >
                  +
                </button>
                {step === 2 && !isGenerating && (
                  <button
                    onClick={() => setStep(3)}
                    className="ml-auto flex items-center gap-1 text-sm text-[#1a73e8] hover:underline"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Step>
          )}

          {/* ── Step 3 — Budget ───────────────────────────────────────────── */}
          {step >= 3 && (
            <Step n={3} title="Daily budget" locked={isGenerating}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {budgets.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBudget(b.id);
                      setStep((s) => Math.max(s, 4));
                      track("budget_selected", { budget: b.id, city });
                    }}
                    disabled={isGenerating}
                    className={cx(
                      `rounded-xl border p-4 text-left transition
                       ${
                         budget === b.id
                           ? "border-[#1a73e8] bg-[#e8f0fe]"
                           : "border-[#dadce0] hover:bg-[#f1f3f4]"
                       }`,
                      isGenerating ? DISABLED_OVERLAY : undefined,
                    )}
                  >
                    <div className="mb-2 text-2xl">{b.emoji}</div>
                    <div className="font-medium text-[#202124]">{b.label}</div>
                    <div className="text-xs text-[#5f6368]">{b.sub}</div>
                  </button>
                ))}
              </div>
            </Step>
          )}

          {/* ── Step 4 — Travel style ─────────────────────────────────────── */}
          {step >= 4 && (
            <Step n={4} title="Travel style" locked={isGenerating}>
              <div className="grid grid-cols-3 gap-2">
                {styles.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setTravelStyle(s.id);
                        setStep((cs) => Math.max(cs, 5));
                        track("style_selected", { travel_style: s.id, city });
                      }}
                      disabled={isGenerating}
                      className={cx(
                        `flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition
                         ${
                           travelStyle === s.id
                             ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                             : "border-[#dadce0] text-[#5f6368] hover:bg-[#f1f3f4]"
                         }`,
                        isGenerating ? DISABLED_OVERLAY : undefined,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </Step>
          )}

          {/* ── Step 5 — Must visit ───────────────────────────────────────── */}
          {step >= 5 && (
            <Step
              n={5}
              title="Any must-visit places? (optional)"
              locked={isGenerating}
            >
              <input
                value={mustVisit}
                onChange={(e) => setMustVisit(e.target.value)}
                placeholder="e.g. Tower of London, Borough Market"
                disabled={isGenerating}
                className={cx(
                  "w-full border border-[#dadce0] rounded-xl px-4 py-3 text-sm text-[#202124] placeholder:text-[#9aa0a6] focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] transition",
                  isGenerating
                    ? "opacity-50 cursor-not-allowed bg-[#f1f3f4]"
                    : undefined,
                )}
              />
              <p className="mt-1.5 text-xs text-[#9aa0a6]">Comma separated.</p>
            </Step>
          )}

          {/* ── Submit ────────────────────────────────────────────────────── */}
          {step >= 4 && budget && travelStyle && (
            <button
              onClick={submit}
              disabled={loading || !city.trim()}
              className="w-full flex items-center justify-center gap-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-medium py-3 rounded-full transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingMessages[loadingMsgIdx]}
                </>
              ) : (
                "Build My Itinerary"
              )}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Step({
  n,
  title,
  locked,
  children,
}: {
  n: number;
  title: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#202124]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e8f0fe] text-[11px] text-[#1a73e8] font-bold">
          {n}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}
