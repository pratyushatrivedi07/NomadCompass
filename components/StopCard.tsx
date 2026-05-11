"use client";

import {
  X,
  Bus,
  Footprints,
  Train,
  Landmark,
  UtensilsCrossed,
  Activity,
  Sailboat,
  Car,
} from "lucide-react";
import type { Stop } from "@/lib/types";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function transportIcon(mode?: string) {
  const m = (mode ?? "").toLowerCase();
  if (m.includes("walk")) return Footprints;
  if (m.includes("cab") || m.includes("taxi") || m.includes("uber")) return Car;
  if (
    m.includes("metro") ||
    m.includes("tube") ||
    m.includes("train") ||
    m.includes("rail") ||
    m.includes("subway") ||
    m.includes("mrt")
  )
    return Train;
  if (m.includes("ferry") || m.includes("boat") || m.includes("water"))
    return Sailboat;
  return Bus;
}

function typeIcon(type?: string) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("food")) return UtensilsCrossed;
  if (t.includes("activity")) return Activity;
  return Landmark;
}

function cap(s?: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function StopCard({
  stop,
  index,
  active,
  onClick,
  onRemove,
  currencySymbol = "$",
}: {
  stop: Stop;
  index: number;
  active: boolean;
  onClick: () => void;
  onRemove?: () => void;
  currencySymbol?: string;
}) {
  const t = stop.transport_from_previous;
  const TIcon = transportIcon(t?.mode);
  const TypeIcon = typeIcon(stop.type);
  const showTransport = t && (t.mode ?? "").toLowerCase() !== "start";
  const fare = t?.fare ?? (t as any)?.cost ?? 0;

  return (
    <div>
      {showTransport && (
        <div className="transport-connector">
          <TIcon className="h-3 w-3 shrink-0" />
          {(t!.mode ?? "").toLowerCase() === "walk" ? (
            <span className="text-[#5f6368]">
              {t!.walk_to_stop_mins ?? 10} min walk
            </span>
          ) : (
            // <span className="text-[#5f6368] truncate">
            //   {/* Mode label */}
            //   <span className="font-medium">{cap(t!.mode)}</span>
            //   {/* Line only if it's real and doesn't repeat the mode word */}
            //   {t!.line &&
            //     t!.line.toLowerCase() !== (t!.mode ?? "").toLowerCase() && (
            //       <span> {t!.line}</span>
            //     )}
            //   {/* Stops */}
            //   {t!.from_stop && t!.to_stop && (
            //     <span className="text-[#9aa0a6]">
            //       {" "}
            //       · {t!.from_stop} → {t!.to_stop}
            //     </span>
            //   )}
            //   {/* Fare */}
            //   {fare > 0 && (
            //     <span className="text-[#9aa0a6]">
            //       {" "}
            //       · {currencySymbol}
            //       {Number(fare).toFixed(2)}
            //     </span>
            //   )}
            // </span>
            <span className="text-[#5f6368] truncate">
              {/* Mode label: Capitalized */}
              <span className="font-medium">{cap(t!.mode)}</span>

              {/* Line: Show only if it exists and isn't "null" or equal to mode */}
              {t!.line &&
                t!.line !== "null" &&
                t!.line.toLowerCase() !== t!.mode.toLowerCase() && (
                  <span> {t!.line}</span>
                )}

              {/* From/To: Show only if both exist and aren't "null" */}
              {t!.from_stop && t!.to_stop && t!.from_stop !== "null" && (
                <span className="text-[#9aa0a6]">
                  {" "}
                  · {t!.from_stop} → {t!.to_stop}
                </span>
              )}

              {/* Fare: Always fixed to 2 decimals if > 0 */}
              {fare > 0 && (
                <span className="text-[#9aa0a6]">
                  {" "}
                  · {currencySymbol}
                  {Number(fare).toFixed(2)}
                </span>
              )}
            </span>
          )}
        </div>
      )}
      <button
        onClick={onClick}
        className={`group flex w-full gap-3 rounded-lg bg-white p-3 text-left transition border ${
          active
            ? "border-[#1a73e8] bg-[#e8f0fe]"
            : "border-transparent hover:bg-[#f1f3f4]"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {letters[index] ?? index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium leading-tight">{stop.name}</div>
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
            <TypeIcon className="h-3 w-3" />
            {stop.type} · {stop.duration_mins} min ·{" "}
            {stop.entry_cost > 0
              ? `${currencySymbol}${stop.entry_cost.toFixed(2)}`
              : "Free"}
          </div>
          {(stop.notes || stop.description) && (
            <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
              {stop.notes ?? stop.description}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
