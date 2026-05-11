import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceTransportModes,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "@/lib/itinerary";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// 1. Input Validation Schema
const InputSchema = z.object({
  city: z.string().min(1).max(120),
  days: z.number().int().min(1).max(7),
  budget: z.enum(["budget", "mid", "comfort"]),
  travelStyle: z.enum(["public", "walking", "mixed"]),
  mustVisit: z.array(z.string().max(120)).max(10).default([]),
});

// 2. Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 3. Define Rate Limits
// Protects your global API Key quota (Free tier is 1,000/day)
const globalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(500, "24 h"),
});

// Protects you from a single user exhausting your credits
const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(3, "24 h"),
});

export async function POST(req: NextRequest) {
  try {
    // --- STAGE 1: Rate Limiting ---

    // Check global safety net first
    const { success: globalOk } =
      await globalLimiter.limit("global_safety_net");
    if (!globalOk) {
      return NextResponse.json(
        { error: "Daily site capacity reached. Check back tomorrow!" },
        { status: 429 },
      );
    }

    // Check individual user limit (3 per day)
    const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
    const { success: userOk, reset } = await ipLimiter.limit(`user_${ip}`);
    if (!userOk) {
      const hoursLeft = Math.ceil((reset - Date.now()) / 3600000);
      return NextResponse.json(
        {
          error: `Limit reached. You can generate more in ${hoursLeft} hours.`,
        },
        { status: 429 },
      );
    }

    // --- STAGE 2: Validation ---

    const body = await req.json();
    const data = InputSchema.parse(body);
    const apiKey = process.env.GEMINI_API_KEY;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildUserPrompt(
                    data.city,
                    data.days,
                    data.budget,
                    data.travelStyle,
                    data.mustVisit,
                  ),
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 12000,
            temperature: 0.1,
            response_mime_type: "application/json",
            response_schema: {
              type: "object",
              required: ["city", "days", "trip_total_cost"],
              properties: {
                city: { type: "string" },
                trip_total_cost: { type: "number" },
                days: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["day", "theme", "stops", "daily_total_cost"],
                    properties: {
                      day: { type: "number" },
                      theme: { type: "string" },
                      daily_total_cost: { type: "number" },
                      stops: {
                        type: "array",
                        minItems: 5,
                        maxItems: 6,
                        items: {
                          type: "object",
                          required: [
                            "name",
                            "type",
                            "lat",
                            "lng",
                            "duration_mins",
                            "entry_cost",
                            "notes",
                            "transport_from_previous",
                          ],
                          properties: {
                            name: { type: "string" },
                            type: {
                              type: "string",
                              enum: ["attraction", "food", "activity"],
                            },
                            lat: { type: "number" },
                            lng: { type: "number" },
                            duration_mins: { type: "number" },
                            entry_cost: { type: "number" },
                            notes: { type: "string" },
                            transport_from_previous: {
                              type: "object",
                              required: [
                                "mode",
                                "line",
                                "from_stop",
                                "to_stop",
                                "fare",
                              ],
                              properties: {
                                mode: {
                                  type: "string",
                                  enum: [
                                    "walk",
                                    "bus",
                                    "metro",
                                    "train",
                                    "ferry",
                                    "start",
                                    "cab",
                                  ],
                                },
                                line: { type: "string", nullable: true },
                                from_stop: { type: "string", nullable: true },
                                to_stop: { type: "string", nullable: true },
                                fare: { type: "number" },
                                walk_to_stop_mins: { type: "number" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    );

    const json = await res.json();

    if (!json.candidates || json.candidates.length === 0) {
      console.error(
        "Gemini Blocked/Empty. Full JSON:",
        JSON.stringify(json, null, 2),
      );

      // Check if it was a safety block
      const safety = json.promptFeedback?.blockReason;
      if (safety) throw new Error(`Blocked by Safety: ${safety}`);

      throw new Error("Gemini returned no candidates.");
    }

    const candidate = json.candidates[0];
    const content = candidate.content?.parts?.[0]?.text;

    if (!content) {
      console.error("Finish Reason:", candidate.finish_reason);
      throw new Error(
        `AI stopped without generating text. Reason: ${candidate.finish_reason}`,
      );
    }

    // Clean any potential Markdown artifacts (just in case)
    const sanitized = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // This will now succeed because response_schema prevents malformed JSON
    const rawItinerary = JSON.parse(sanitized);

    const corrected = enforceTransportModes(
      rawItinerary,
      data.city,
      data.travelStyle,
    );
    return NextResponse.json(corrected);
  } catch (e: any) {
    console.error("Final Route Error:", e);
    return NextResponse.json(
      { error: e.message || "Internal Server Error", stack: e.stack },
      { status: 500 },
    );
  }
}
