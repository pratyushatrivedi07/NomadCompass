# Nomad's Compass

> Trip planning that actually leaves the group chat.

A solo-built product prototype exploring a missing feature in Google Maps: transport-aware, budget-filtered, day-structured trip planning for first-time international travellers.

**Live:** [nomads-compass.vercel.app](https://nomads-compass.vercel.app?utm_source=github&utm_medium=social)

---

## The problem

First-time international travellers spend 2–3 days across five apps assembling a trip plan. Google Maps navigates a city but doesn't plan one: no day structure, no itinerary, no budget. Wanderlog organises what you already found — a first-timer gets no help. TripAdvisor is discovery, not planning. Rome2Rio is city-to-city. Citymapper is transit-only. Each nails one piece; all of them assume you've done the hardest part.

**The underserved user:** someone who wants to move like a local — public transport, real lines, real stops, real fares — inside a day-by-day plan, with budgets in the city's own currency.

---

## What it does

Pick a city → set days, budget tier, travel style, optional must-visit places → get a full itinerary:

- **Transport-first planning.** Every leg between stops carries the transport mode, real line name (e.g. "Violet Line"), boarding and alighting stop names, fare in local currency, and walking minutes to the station.
- **Day-wise map view.** Stops plotted as lettered markers with colour-coded polylines per transport mode — metro in purple, bus in red, cab in dark violet, walk dashed green, ferry dashed blue.
- **Budget tiers in local currency.** Budget / Mid-range / Comfort, with per-day cost estimates in ₹, £, $, AUD, ¥, AED, SGD — not a flat USD default.
- **Hard transport rules enforced in code.** The AI prompt carries strict rules; a post-processing pass in code corrects any violations before the itinerary renders. Walking is capped at 1 km. Any longer leg with no known public route falls back to cab — never a 90-minute "walk" leg.
- **Editable stops.** Remove any stop; add a place via Nominatim search. Manually added stops get a distance-based transport mode assignment.
- **Save & share.** Save writes the trip to Supabase. Share produces a non-editable link anyone can open without an account.
- **Rate limiting.** 3 generations per IP per day, 200 global per day. Shipped before launch because the API bill lands on a personal card.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 App Router | Server components, API routes, edge-ready |
| Styling | Tailwind CSS | Utility-first, no design system overhead |
| Map | Leaflet.js + OpenStreetMap | Free tier; no Google Maps API billing |
| AI | Google Gemini 3.5 Flash (Fallback: Gemini 3.1 Flash Lite) | Fast structured-JSON output; fallback to 2.0 Flash Lite on spike |
| Database | Supabase (Postgres) | Free tier; RLS for public share links |
| Rate limiting | Upstash Redis | Serverless-safe; fixed-window per IP + global |
| Analytics | GA4 + Vercel Analytics | GA4 with CookieYes consent for GDPR regions |
| Deployment | Vercel | Zero-config, edge functions |

---

## Setup

```bash
git clone https://github.com/pratyushatrivedi07/NomadCompass
cd NomadCompass
npm install
cp .env.example .env.local
# fill in env vars below
npm run dev
```

### Environment variables

```
GEMINI_API_KEY=                 # aistudio.google.com
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project settings
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase project settings
UPSTASH_REDIS_REST_URL=         # Upstash console
UPSTASH_REDIS_REST_TOKEN=       # Upstash console
NEXT_PUBLIC_GA_ID=              # GA4 measurement ID (optional)
```

---

## What shipped in v1

- Multi-step setup form (city, days, budget, travel style, must-visit)
- AI itinerary generation with structured JSON schema enforcement
- Post-processing transport correction layer (distance checks, mode override, fare normalisation)
- Day-wise map with Leaflet markers + colour-coded polylines by transport mode
- Bottom-sheet / sidebar layout — responsive mobile and desktop
- Remove a stop from any day
- Add a stop via Nominatim place search (debounced, city-scoped)
- Save itinerary to Supabase with a generated share slug
- Non-editable shared view at `/t/[slug]`
- Saved trips list (`/trips`) with delete
- Gemini fallback: primary model times out at 20 s → switches to Flash Lite; hard cap 50 s
- IP + global rate limiting via Upstash (3/day per IP, 200/day global)
- GA4 with CookieYes consent mode for EEA/UK/CH
- Curated city list: London, Paris, Rome, Amsterdam, Tokyo, New York, Dubai, Singapore, Sydney, Delhi

---

<!-- ## What's next

**Near-term (next iteration):**
- **Must-visit place suggestions.** Debounced Nominatim autocomplete on the setup form's "must-visit" field, city-scoped — so typing "eif" in a Paris trip surfaces "Eiffel Tower" before you finish typing, instead of a free-text box that guesses nothing.
- **AI-routed manual stops.** When a user adds a stop via search, call the AI (or OSRM) to calculate the real route, transit leg, and fare — instead of the current distance-based heuristic.
- **Stop detail panel.** Clicking a map marker or stop card opens a rich panel: photo from Wikimedia/Unsplash, opening hours, Google Maps link, traveller tip — the missing half of the Google Maps stop-info UX.
- **Analytics instrumentation + launch.** Filter internal traffic, verify funnel metrics, publish.
- **More cities.** Barcelona, Istanbul, Bangkok, Bali, Lisbon, Prague.

**Medium-term:**
- **Collaborative planning.** Invite link lets co-travellers vote on or swap stops without destroying the base itinerary. Separate product surface, not a bolted-on feature.
- **Day-of-travel mode.** On saved itinerary open, detect if travel date matches today → show condensed single-stop view with live departure times (where transit APIs exist).
- **Drag-to-reorder stops.** Currently cut: first-timers want a plan that works, not curation. Viable once the core UX is validated.
- **Multi-city trips.** Edge cases triple; deferred until single-city is proven.

**Speculative:**
- **Transit API integration.** Replace AI-generated fares and lines with live GTFS data (TfL, MTA, NMBS) for cities where it's available.
- **Hotel / accommodation anchoring.** First stop each day departs from the hotel — unlocks realistic geographic routing.
- **Offline itinerary.** PWA + cached itinerary JSON for day-of use without data. -->

---

## Architecture decisions

**Why not Google Maps API?**
Cost. A 5-day itinerary with map tiles + geocoding + directions would burn through the free tier in days. Leaflet + OpenStreetMap is free, works offline, and the UX is near-identical for a planning view.

**Why Gemini for structured output?**
The `response_schema` parameter forces Gemini to emit typed JSON directly — no markdown stripping, no regex parsing. The schema is enforced at the API level, not by prompt alone.

**Why post-process transport in code?**
The AI knows routes but can't guarantee correctness on every city. Code enforces hard constraints (walk cap, cab fallback, generic line-name rejection) so the user never sees a hallucinated "Bus 999" or a 5 km "walk" leg.

**Why ship rate limits before launch?**
Tested 4–6 itineraries casually during QA. At Gemini pricing, free users doing the same would make the API bill non-trivial within a week. Rate limits are unit economics, not a scale problem.

---

## Case study

Full product write-up (problem, bets, metrics, what went wrong): Releasing soon

<!-- [read the case study](https://www.linkedin.com/in/pratyush-trivedi07/) _(LinkedIn — link to article once published)_ -->

---

## Status

Live prototype · actively iterating · built nights & weekends in ~3 weeks.
