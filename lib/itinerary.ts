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

export function enforceTransportModes(
  parsed: any,
  city: string,
  travelStyle: string,
): any {
  const transit = CITY_TRANSIT[city.toLowerCase()] ?? {
    metroName: "Metro",
    busName: "Bus",
    metroFare: 2.5,
    busFare: 1.75,
  };

  const correctedDays = parsed.days.map((day: any) => {
    const correctedStops = day.stops.map((stop: any, i: number) => {
      if (i === 0) return stop;

      const prev = day.stops[i - 1];
      const dist = haversineKm(prev.lat, prev.lng, stop.lat, stop.lng);
      const t = stop.transport_from_previous ?? {};
      const currentMode = (t.mode ?? "walk").toLowerCase();

      if (currentMode === "start") return stop;
      if (currentMode === "ferry") return stop;

      let correctedMode = currentMode;
      let correctedFare = t.fare ?? 0;

      if (dist < 0.8) {
        correctedMode = "walk";
        correctedFare = 0;
      } else if (dist < 3) {
        if (currentMode === "walk") {
          correctedMode = "bus";
          correctedFare = transit.busFare;
        }
      } else {
        if (currentMode === "walk" || currentMode === "bus") {
          correctedMode = "metro";
          correctedFare = transit.metroFare;
        }
      }

      if (travelStyle === "walking" && dist < 1.5) {
        correctedMode = "walk";
        correctedFare = 0;
      }

      return {
        ...stop,
        transport_from_previous: {
          ...t,
          mode: correctedMode,
          fare: correctedFare,
          // Only keep line if AI provided a real one — never use generic name as fallback
          line:
            correctedMode === "metro"
              ? t.line &&
                t.line !== transit.metroName &&
                t.line !== "Metro" &&
                t.line !== "metro"
                ? t.line
                : null
              : correctedMode === "bus"
                ? t.line &&
                  t.line !== transit.busName &&
                  t.line !== "Bus" &&
                  t.line !== "bus"
                  ? t.line
                  : null
                : null,
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

// JSON structure:
// {
//   "city": "string",
//   "days": [
//     {
//       "day": 1,
//       "theme": "string",
//       "stops": [
//         {
//           "name": "string",
//           "type": "attraction | food | activity",
//           "lat": float,
//           "lng": float,
//           "duration_mins": int,
//           "entry_cost": float,
//           "notes": "string (1 sentence max)",
//           "transport_from_previous": {
//             "mode": "walk | bus | metro | train | ferry | start",
//             "line": "string or null",
//             "from_stop": "string or null",
//             "to_stop": "string or null",
//             "fare": float,
//             "walk_to_stop_mins": int
//           }
//         }
//       ],
//       "daily_total_cost": float
//     }
//   ],
//   "trip_total_cost": float
// }

// TRANSPORT RULES — non-negotiable:

// WALK:
// - Use ONLY when actual walking distance between stops is under 1km
// - mode = "walk", line = null, from_stop = null, to_stop = null, fare = 0
// - walk_to_stop_mins = realistic walking time in minutes

// BUS:
// - Use for distances between 1km and 4km where a real bus route exists
// - line = REAL route number only (e.g. "15", "N29", "RV1") — no word "Bus" in the line field
// - from_stop = exact real bus stop name nearest to origin
// - to_stop = exact real bus stop name nearest to destination
// - fare = actual local currency fare
// - If you cannot identify a real bus route number and real stop names, DO NOT use bus — use metro instead
// - NEVER invent a bus route number

// METRO / TUBE / SUBWAY / MRT:
// - Use for distances over 2km where metro exists, or when bus route is unknown
// - line = real line name only (e.g. "Central Line", "Line 4", "Red Line") — no word "Metro" in line field
// - from_stop = exact real station name
// - to_stop = exact real station name
// - fare = actual local currency fare
// - If you cannot confirm a real metro line and stations, DO NOT include metro — rethink the route

// TRAIN:
// - Use for inter-district travel where overground/suburban train is the natural option
// - Same rules as metro for line, from_stop, to_stop

// FERRY:
// - Use when water crossing is required (Sydney Harbour, Amsterdam canals, Singapore River)
// - line = ferry service name (e.g. "F3 Manly Ferry")
// - from_stop = departure wharf/pier name
// - to_stop = arrival wharf/pier name
// - NEVER classify ferry as metro, bus, or train

// START:
// - First stop of each day always uses mode = "start"
// - fare = 0, line = null, from_stop = null, to_stop = null

// CRITICAL RULES:
// - If you don't know the exact bus route number: skip bus, use metro or walk
// - If you don't know the exact metro line: skip metro, reroute via bus or walk
// - Never use walk for distances over 1km
// - Never show "Bus Bus" or "Metro Metro" — line field must not repeat the mode word
// - All fares in LOCAL currency of the city
// - Stops ordered geographically — route must never cross itself on a map
// - 4–6 stops per day, exactly 1 food stop per day at meal time
// - daily_total_cost = sum of all entry_cost + all fares for that day`;

// export const SYSTEM_PROMPT = `You are a travel planning assistant. Return ONLY valid JSON. No markdown, no code fences. Start with { end with }.

// JSON structure: city (string), days (array of: day int, theme string, stops array, daily_total_cost float), trip_total_cost float.
// Each stop: name, type (attraction|food|activity), lat, lng, duration_mins, entry_cost, notes (1 sentence), transport_from_previous (mode, line, from_stop, to_stop, fare, walk_to_stop_mins).

// TRANSPORT RULES:
// - Under 1km: walk only. fare=0, line=null, stops=null.
// - 1–4km: bus if real route confirmed, else metro.
// - Over 4km: metro or train.
// - Ferry: use for water crossings only.
// - First stop per day: mode="start", fare=0, line=null, stops=null.
// - Bus line = route number only (e.g. "15" not "Bus 15"). Must be real.
// - Metro line = line name only (e.g. "Central Line" not "Metro Central Line"). Must be real.
// - from_stop and to_stop = real stop/station names. Required for bus and metro.
// - If real route unknown: use walk (under 1km) or metro without line details.
// - All fares in local city currency.
// - Never walk over 1km. Never invent routes.
// - Order stops geographically — no route crossings.
// - 4–6 stops/day, exactly 1 food stop at meal time.
// - daily_total_cost = sum of entry_cost + fares.`;

export const SYSTEM_PROMPT = `You are a high-performance travel logistics engine (May 2026).
Your goal is to provide a dense, geographically optimized itinerary in valid JSON.

### USER CONSTRAINTS:
1. **Must-Visit Places**: You MUST prioritize and include all "mustVisit" locations provided by the user in the itinerary.
2. **Transit Preference**: Prioritize Public Transport (Metro/Bus) over Cabs. Only use "cab" if no plausible transit route exists.

### TRANSPORT HIERARCHY:
1. **START**: First stop of each day. (mode: "start", fare: 0, others: null).
2. **WALK**: Use for distances < 1km. (mode: "walk", fare: 0, others: null).
3. **PUBLIC**: Use for distances > 1km ONLY if a real-world route number/name is identified.
   - 'line': Specific number/name (e.g. "15", "District Line"). No "Bus" or "Metro" in string.
   - 'from_stop' & 'to_stop': Exact official station/stop names.
4. **CAB**: Use ONLY if no specific public transit route can be identified.
   - mode: "cab", line: "Uber/Taxi", from_stop: "Current Location", to_stop: "Destination".

### LOGISTICS:
- **Density**: Exactly 5-6 stops per day.
- **Food**: Exactly 1 stop per day must be "type": "food" at meal time.
- **Brevity**: 'notes' must be under 10 words. 'theme' under 3 words.
- **Geography**: Sequence stops in a logical one-way path. No "zig-zagging".
- **Currency**: All costs in local currency.`;

export function buildUserPrompt(
  city: string,
  days: number,
  budget: string,
  travelStyle: string,
  mustVisit: string[],
): string {
  const budgetLabel: Record<string, string> = {
    budget: "low budget — prioritise free attractions and cheap eats",
    mid: "mid-range — mix of paid attractions and mid-range restaurants",
    comfort:
      "comfort — premium experiences, good restaurants, avoid budget constraints",
  };
  const styleLabel: Record<string, string> = {
    public:
      "public transport only — always use the fastest available transit option",
    walking:
      "walking preferred — walk whenever under 1km, use transit only beyond 1km",
    mixed:
      "mixed — walk short distances under 1km, use transit for anything beyond",
  };
  const currency = getCurrency(city);

  return `Generate a ${days}-day itinerary for ${city}.
Budget: ${budgetLabel[budget] ?? budget}
Travel style: ${styleLabel[travelStyle] ?? travelStyle}
Must-visit: ${mustVisit.length ? mustVisit.join(", ") : "none specified"}
Currency: ALL monetary values (fares, entry costs) must be in ${currency.code} (${currency.symbol})

Verify before including any transport:
- For bus: confirm the route number exists in ${city} and the stop names are real
- For metro: confirm the line name and station names are real in ${city}
- If unsure about bus or metro details, use walk (if under 1km) or omit that transport leg

Geographic constraint: order stops to minimise total walking distance per day. No route should cross itself on a map. If must-visit places are spread across the city, split them across different days.`;
}
