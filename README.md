# Nomad's Compass: AI-Powered Tourist Itinerary Planner

A product prototype exploring a missing feature in Google Maps: transport-aware, budget-filtered, day-structured trip planning for first-time international travellers.

## The Problem

First-time travellers spend 2–3 days across 5 apps to plan a trip. Google Maps navigates cities but doesn't help you plan them.

## What This Does

- Generates a day-by-day itinerary for any city using AI (Gemini)
- Shows which bus/train to take between each stop, with stop names and fare
- Filters recommendations by budget tier (Budget / Mid / Comfort)
- Plots stops on a live map with lettered markers and colour-coded routes
- Lets you remove stops, add places via search, and save your itinerary
- Shareable itinerary links

## Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Map:** Leaflet.js + OpenStreetMap
- **AI:** Gemini Fast API
- **Database:** Supabase
- **Redis Rate Limit:** Upstash
- **Deployment:** Vercel

## Setup

```bash
git clone https://github.com/yourusername/NomadCompass
cd NomadCompass
npm install
cp .env.example .env.local
# Fill in your API keys in .env.local
npm run dev
```

## Environment Variables

```
GEMINI_API_KEY=                 # From console.anthropic.com
NEXT_PUBLIC_SUPABASE_URL=       # From Supabase project settings
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # From Supabase project settings
UPSTASH_REDIS_REST_URL=         # From Upstash settings for Rate Limit
UPSTASH_REDIS_REST_TOKEN=       # From Upstash settings for Rate Limit
```

## Live Demo

[nomads-compass.vercel.app](nomads-compass.vercel.app)

## PRD & Case Study

[LinkedIn Article — add link once published]

## Status

MVP — actively iterating.
