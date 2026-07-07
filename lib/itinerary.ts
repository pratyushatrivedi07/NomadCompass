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

const GENERIC_LINE_NAMES = new Set([
  "bus",
  "metro",
  "subway",
  "mrt",
  "train",
  "taxi",
  "dtc bus",
  "tube",
  "tram",
]);

function isRealLine(line: string | null | undefined): boolean {
  if (!line || line.trim() === "" || line === "null") return false;
  return !GENERIC_LINE_NAMES.has(line.trim().toLowerCase());
}

function isRealStop(stop: string | null | undefined): boolean {
  return !!stop && stop !== "null" && stop.trim() !== "";
}

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

      if (currentMode === "start") return stop;
      if (currentMode === "ferry") return stop;
      if (currentMode === "cab") return stop;

      const hasGoodLine = isRealLine(t.line);
      const hasGoodStops = isRealStop(t.from_stop) && isRealStop(t.to_stop);
      const aiFare = t.fare ?? 0;

      // Walking style override — walk up to 1.5 km
      if (travelStyle === "walking" && dist < 1.5) {
        return {
          ...stop,
          transport_from_previous: {
            mode: "walk",
            fare: 0,
            line: null,
            from_stop: null,
            to_stop: null,
            walk_to_stop_mins: Math.round((dist * 1000) / 80),
          },
        };
      }

      // Short distance — always walk
      if (dist < 1.0) {
        return {
          ...stop,
          transport_from_previous: {
            mode: "walk",
            fare: 0,
            line: null,
            from_stop: null,
            to_stop: null,
            walk_to_stop_mins: Math.round((dist * 1000) / 80),
          },
        };
      }

      // AI said walk but it's too far — upgrade
      if (currentMode === "walk" && dist >= 1.0) {
        if (hasMetro) {
          return {
            ...stop,
            transport_from_previous: {
              mode: "metro",
              fare: transit.metroFare,
              line: null,
              from_stop: null,
              to_stop: null,
              walk_to_stop_mins: null,
            },
          };
        }
        return {
          ...stop,
          transport_from_previous: {
            mode: "cab",
            fare: Math.round(dist * 20),
            line: "Taxi",
            from_stop: prev.name,
            to_stop: stop.name,
            walk_to_stop_mins: null,
          },
        };
      }

      // Bus/metro/train with good data from AI — keep it, trust AI fare
      if (hasGoodLine && hasGoodStops && aiFare > 0) {
        return stop;
      }

      // Bus/metro/train with generic or missing data — fix it
      if (currentMode === "bus" && (!hasGoodLine || !hasGoodStops)) {
        if (hasMetro) {
          return {
            ...stop,
            transport_from_previous: {
              mode: "metro",
              fare: aiFare > 0 ? aiFare : transit.metroFare,
              line: hasGoodLine ? t.line : null,
              from_stop: hasGoodStops ? t.from_stop : null,
              to_stop: hasGoodStops ? t.to_stop : null,
              walk_to_stop_mins: t.walk_to_stop_mins ?? null,
            },
          };
        }
        return {
          ...stop,
          transport_from_previous: {
            mode: "cab",
            fare: Math.round(dist * 20),
            line: "Taxi",
            from_stop: prev.name,
            to_stop: stop.name,
            walk_to_stop_mins: null,
          },
        };
      }

      if (
        (currentMode === "metro" || currentMode === "train") &&
        !hasGoodLine
      ) {
        // Strip generic line name but keep the mode and AI fare
        return {
          ...stop,
          transport_from_previous: {
            ...t,
            line: null,
            from_stop: hasGoodStops ? t.from_stop : null,
            to_stop: hasGoodStops ? t.to_stop : null,
            fare: aiFare > 0 ? aiFare : transit.metroFare,
          },
        };
      }

      return stop;
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

export const SYSTEM_PROMPT = `You are a travel logistics engine for first-time tourists. Return valid JSON only. No markdown.

GEOGRAPHIC ORDERING (CRITICAL):
- Plan each day's stops as a WALKING ROUTE on a map — sequential, no backtracking.
- Pick a starting neighbourhood, then move in ONE direction (e.g. north→south, or clockwise).
- The route from stop A→B→C→D must NEVER cross itself. If you drew lines between consecutive stops on a map, no two lines should intersect.
- Group nearby attractions together on the same day. Never zigzag across the city.

TRANSPORT MODES — use in this priority order:
- start: first stop each day. fare=0, line=null, from_stop=null, to_stop=null.
- walk: under 1 km. fare=0, line=null, from_stop=null, to_stop=null, walk_to_stop_mins=estimated walk time.
- bus: 1–4 km, ONLY if you know the real route number. line=route number only (e.g. "15" not "Bus 15"). from_stop=real bus stop name. to_stop=real bus stop name. fare=actual fare in local currency.
- metro: over 1.5 km, ONLY if you know the real line name. line=line name only (e.g. "Central Line" not "Metro Central Line", "Ginza Line" not "Metro Ginza Line"). from_stop=real station name. to_stop=real station name. fare=actual fare in local currency.
- train: suburban/overground rail. Same rules as metro — real line name, real station names, real fare.
- ferry: water crossings only. line=service name, from_stop=pier name, to_stop=pier name.
- cab: ONLY when no public transit route is known, OR when the user selected comfort style. line="Taxi", from_stop=origin place name, to_stop=destination place name. fare=realistic estimated fare for that city.

TRANSPORT HARD RULES:
- line field must NEVER equal generic words like "Bus", "Metro", "Subway", "MRT", "Train", "Taxi" alone — it must be a specific route/line name or null.
- from_stop and to_stop are REQUIRED (never null) for bus, metro, train, ferry, and cab.
- from_stop and to_stop are real place names that exist — never invent them.
- fare must be a realistic cost in the local currency for that specific journey — not a flat default. Use your knowledge of actual transit pricing in that city (e.g. Tokyo Metro is ¥170–¥320 depending on distance, London Tube is £2.80 peak, Delhi Metro is ₹20–₹60 by distance).
- If you cannot confirm a real route number or line name, use cab instead of guessing.

ITINERARY RULES:
- 5-6 stops per day, including exactly 1 food stop at a logical meal time, but exclude when doing a full-day tour like an amusement park, studio tour.
- daily_total_cost = sum of all entry_cost + all transport fares for that day.
- trip_total_cost = sum of all daily totals.
- All monetary values in the local currency of the city.`;

export function buildUserPrompt(
  city: string,
  days: number,
  budget: string,
  travelStyle: string,
  mustVisit: string[],
): string {
  const currency = getCurrency(city);

  const budgetInstructions: Record<string, string> = {
    budget: `LOW BUDGET — prioritise free attractions, street food, public parks, free museum days, markets. Food stops should be cheap local eateries or street food (not restaurants). Avoid anything with entry cost over ${currency.symbol}${budget === "budget" ? "10" : "15"} equivalent. Total daily spend should stay within the budget tier for ${city}.`,
    mid: `MID-RANGE — mix of paid attractions and free ones. Food stops should be good local restaurants (not luxury, not street food). Entry costs for premium attractions are fine. Balance between popular tourist spots and local gems.`,
    comfort: `COMFORT / PREMIUM — focus on the best experiences regardless of cost. Include premium restaurants, skip-the-line attractions, exclusive experiences. Prefer cab/private transport over crowded public transit for longer legs. Choose comfort and convenience over saving money.`,
  };

  const styleInstructions: Record<string, string> = {
    public: `PUBLIC TRANSPORT PREFERRED — use real bus routes and metro/subway lines for all distances over 1 km. Only use cab if genuinely no public transit option exists for that leg. The traveller wants to experience the city's transit system. Always provide the specific line name, boarding stop, and alighting stop.`,
    walking: `WALKING PREFERRED — group stops within walkable clusters (under 1.5 km apart). Only use transit for legs over 1.5 km. Maximise walking between nearby stops. The traveller enjoys exploring on foot and wants stops that are geographically tight.`,
    mixed: `MIXED TRANSPORT — walk for short distances (under 1 km), use public transit or cab for longer legs. Balance convenience with cost. For comfort budget, lean towards cab for distances over 3 km.`,
  };

  return `Plan a ${days}-day tourist itinerary for ${city}.

BUDGET: ${budgetInstructions[budget] ?? budget}

TRAVEL STYLE: ${styleInstructions[travelStyle] ?? travelStyle}

${mustVisit.length ? `MUST INCLUDE THESE PLACES: ${mustVisit.join(", ")}. Work them into the itinerary at logical points in the geographic route.` : ""}

CRITICAL REMINDERS:
- All costs in ${currency.code} (${currency.symbol}).
- Order stops geographically — move in one direction, no criss-crossing.
- Every bus/metro/train must have a REAL line name and REAL stop names that exist in ${city}.
- Every fare must be a realistic price for that specific journey in ${city}, not a flat default.
- If you are unsure about a transit route, use cab instead of guessing.`;
}
