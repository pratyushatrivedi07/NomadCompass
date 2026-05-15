import { getCurrency } from "./cities";
import { haversineKm } from "./utils";

const CITY_TRANSIT: Record<
  string,
  { metroName: string; busName: string; metroFare: number; busFare: number }
> = {
  london: { metroName: "Tube", busName: "Bus", metroFare: 2.8, busFare: 1.75 },
  paris: { metroName: "Métro", busName: "Bus", metroFare: 2.1, busFare: 2.1 },
  rome: { metroName: "Metro", busName: "Bus", metroFare: 1.5, busFare: 1.5 },
  amsterdam: {
    metroName: "Metro",
    busName: "Tram",
    metroFare: 3.2,
    busFare: 3.2,
  },
  tokyo: { metroName: "Metro", busName: "Bus", metroFare: 200, busFare: 230 },
  "new york": {
    metroName: "Subway",
    busName: "Bus",
    metroFare: 2.9,
    busFare: 2.9,
  },
  dubai: { metroName: "Metro", busName: "Bus", metroFare: 7.5, busFare: 4.0 },
  singapore: {
    metroName: "MRT",
    busName: "Bus",
    metroFare: 1.68,
    busFare: 1.68,
  },
  sydney: { metroName: "Train", busName: "Bus", metroFare: 3.8, busFare: 2.5 },
  delhi: {
    metroName: "Delhi Metro",
    busName: "DTC Bus",
    metroFare: 30,
    busFare: 15,
  },
};

const CITIES_WITH_METRO = new Set([
  "london",
  "paris",
  "barcelona",
  "rome",
  "amsterdam",
  "tokyo",
  "new york",
  "dubai",
  "singapore",
  "sydney",
  "delhi",
]);

export function enforceTransportModes(
  parsed: any,
  city: string,
  travelStyle: string,
): any {
  const cityKey = city.toLowerCase();
  const transit = CITY_TRANSIT[cityKey] ?? {
    metroName: "Metro",
    busName: "Bus",
    metroFare: 2.5,
    busFare: 1.75,
  };
  const hasMetro = CITIES_WITH_METRO.has(cityKey);

  const correctedDays = parsed.days.map((day: any) => {
    const correctedStops = day.stops.map((stop: any, i: number) => {
      if (i === 0) return stop;

      const prev = day.stops[i - 1];
      const dist = haversineKm(prev.lat, prev.lng, stop.lat, stop.lng);
      const t = stop.transport_from_previous ?? {};
      const currentMode = (t.mode ?? "walk").toLowerCase();

      // Never touch these — they're correct as-is
      if (currentMode === "start") return stop;
      if (currentMode === "ferry") {
        // Only keep ferry if it's actually a water crossing (dist check is unreliable for ferry)
        // Keep as-is — ferry data comes from AI which knows the geography
        return stop;
      }
      if (currentMode === "cab") return stop; // AI explicitly chose cab — respect it

      // Check if bus/metro has real route data
      const hasRealLine =
        t.line &&
        t.line.toLowerCase() !== "bus" &&
        t.line.toLowerCase() !== "metro" &&
        t.line.toLowerCase() !== "subway" &&
        t.line.toLowerCase() !== "dtc bus" &&
        t.line.toLowerCase() !== "taxi" &&
        t.line.trim() !== "";

      const hasRealStops =
        t.from_stop &&
        t.to_stop &&
        t.from_stop !== "null" &&
        t.to_stop !== "null";

      let correctedMode = currentMode;
      let correctedFare = t.fare ?? 0;
      let correctedLine = t.line ?? null;
      let correctedFromStop = t.from_stop ?? null;
      let correctedToStop = t.to_stop ?? null;

      // Walking style override — walk anything under 1.5km
      if (travelStyle === "walking" && dist < 1.5) {
        return {
          ...stop,
          transport_from_previous: {
            ...t,
            mode: "walk",
            fare: 0,
            line: null,
            from_stop: null,
            to_stop: null,
            walk_to_stop_mins: Math.round((dist * 1000) / 80),
          },
        };
      }

      if (dist < 1.2) {
        // Short distance — always walk regardless of what AI said
        correctedMode = "walk";
        correctedFare = 0;
        correctedLine = null;
        correctedFromStop = null;
        correctedToStop = null;
      } else if (dist < 4) {
        // Medium distance
        if (currentMode === "walk") {
          // AI said walk but it's too far — upgrade
          if (hasMetro) {
            correctedMode = "metro";
            correctedFare = transit.metroFare;
            correctedLine = t.line && hasRealLine ? t.line : null;
            correctedFromStop = hasRealStops ? t.from_stop : null;
            correctedToStop = hasRealStops ? t.to_stop : null;
          } else {
            correctedMode = "cab";
            correctedFare = Math.round(dist * 20);
            correctedLine = "Taxi";
            correctedFromStop = prev.name;
            correctedToStop = stop.name;
          }
        } else if (currentMode === "bus") {
          if (!hasRealLine || !hasRealStops) {
            // Bus without real data — downgrade to metro or cab
            if (hasMetro) {
              correctedMode = "metro";
              correctedFare = transit.metroFare;
              correctedLine = null;
              correctedFromStop = null;
              correctedToStop = null;
            } else {
              correctedMode = "cab";
              correctedFare = Math.round(dist * 20);
              correctedLine = "Taxi";
              correctedFromStop = prev.name;
              correctedToStop = stop.name;
            }
          }
          // Bus with real data — keep it as-is
        } else if (currentMode === "metro") {
          correctedFare = transit.metroFare;
          // Keep line/stops from AI if they look real
        }
      } else {
        // Long distance — metro or cab
        if (currentMode === "walk") {
          if (hasMetro) {
            correctedMode = "metro";
            correctedFare = transit.metroFare;
            correctedLine = hasRealLine ? t.line : null;
            correctedFromStop = hasRealStops ? t.from_stop : null;
            correctedToStop = hasRealStops ? t.to_stop : null;
          } else {
            correctedMode = "cab";
            correctedFare = Math.round(dist * 20);
            correctedLine = "Taxi";
            correctedFromStop = prev.name;
            correctedToStop = stop.name;
          }
        } else if (currentMode === "bus" && (!hasRealLine || !hasRealStops)) {
          correctedMode = "metro";
          correctedFare = transit.metroFare;
          correctedLine = null;
          correctedFromStop = null;
          correctedToStop = null;
        } else if (currentMode === "metro") {
          correctedFare = transit.metroFare;
        }
      }

      return {
        ...stop,
        transport_from_previous: {
          ...t,
          mode: correctedMode,
          fare: correctedFare,
          line: correctedLine,
          from_stop: correctedFromStop,
          to_stop: correctedToStop,
          walk_to_stop_mins:
            correctedMode === "walk"
              ? Math.round((dist * 1000) / 80)
              : (t.walk_to_stop_mins ?? null),
        },
      };
    });

    const recalcTotal = correctedStops.reduce(
      (sum: number, s: any) =>
        sum + (s.entry_cost ?? 0) + (s.transport_from_previous?.fare ?? 0),
      0,
    );

    return { ...day, stops: correctedStops, daily_total_cost: recalcTotal };
  });

  const tripTotal = correctedDays.reduce(
    (s: number, d: any) => s + (d.daily_total_cost ?? 0),
    0,
  );

  return { ...parsed, days: correctedDays, trip_total_cost: tripTotal };
}

export function parseItineraryJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    let jsonStr = content;
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    } else {
      const start = content.indexOf("{");
      if (start !== -1) jsonStr = content.substring(start);
    }
    try {
      return JSON.parse(jsonStr);
    } catch {
      let depth = 0;
      let lastSafePos = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{" || jsonStr[i] === "[") depth++;
        if (jsonStr[i] === "}" || jsonStr[i] === "]") {
          depth--;
          if (depth <= 1) lastSafePos = i + 1;
        }
      }
      const truncated = jsonStr.substring(0, lastSafePos);
      try {
        return JSON.parse(
          truncated + (truncated.trimEnd().endsWith("]") ? "}" : "]}]}"),
        );
      } catch {
        throw new Error("Couldn't generate itinerary — try again.");
      }
    }
  }
}

export const SYSTEM_PROMPT = `Travel logistics engine. Return valid JSON only. No markdown.

TRANSPORT MODES (use in this priority order):
- start: first stop each day. fare=0, all others null.
- walk: under 1km only. fare=0, line=null, stops=null.
- bus: 1–4km, real numbered route confirmed. line="route number only" (e.g. "15" not "Bus 15"). from_stop and to_stop = real stop names. If route unknown → use cab.
- metro: over 2km, real line confirmed. line="line name only" (e.g. "Central Line" not "Metro Central Line"). from_stop and to_stop = real station names. If line unknown → use cab.
- train: suburban/overground rail. Same rules as metro.
- ferry: water crossings only. line=service name, from_stop=pier, to_stop=pier. Never use for land routes.
- cab: last resort when no public transit confirmed. line="Taxi", from_stop=origin name, to_stop=destination name.

HARD RULES:
- line field never equals "Bus", "Metro", "Subway", "Taxi" alone
- from_stop and to_stop required for bus/metro/train/ferry/cab — never null
- Never walk over 1km
- Never invent a route number or station name
- All fares in local city currency
- 4–5 stops/day, exactly 1 food stop at meal time
- Stops ordered geographically, no route crossings
- daily_total_cost = sum of entry_cost + all fares that day`;

export function buildUserPrompt(
  city: string,
  days: number,
  budget: string,
  travelStyle: string,
  mustVisit: string[],
): string {
  const currency = getCurrency(city);
  const budgetMap: Record<string, string> = {
    budget: "low budget, free/cheap attractions",
    mid: "mid-range, mix of paid and free",
    comfort: "comfort, premium experiences",
  };
  const styleMap: Record<string, string> = {
    public: "public transit preferred over cab",
    walking: "walk under 1km, transit beyond",
    mixed: "walk short, transit or cab for longer legs",
  };

  return `${days}-day itinerary for ${city}.
Budget: ${budgetMap[budget] ?? budget}
Style: ${styleMap[travelStyle] ?? travelStyle}
Must include: ${mustVisit.length ? mustVisit.join(", ") : "none"}
All costs in ${currency.code} (${currency.symbol}).
Verify every bus route number and metro line name is real in ${city}. Use cab if uncertain.`;
}
