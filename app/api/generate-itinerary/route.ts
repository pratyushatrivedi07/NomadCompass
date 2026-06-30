import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceTransportModes,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "@/lib/itinerary";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const InputSchema = z.object({
  city: z.string().min(1).max(120),
  days: z.number().int().min(1).max(7),
  budget: z.enum(["budget", "mid", "comfort"]),
  travelStyle: z.enum(["public", "walking", "mixed"]),
  mustVisit: z.array(z.string().max(120)).max(10).default([]),
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const globalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(200, "24 h"),
  prefix: "global",
});

const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(3, "24 h"),
  prefix: "ip",
});

// Extract JSON from Gemini response — handles both structured output and text
function extractJson(candidate: any): any {
  // Path 1: structured output (response_mime_type: application/json)
  // Gemini returns it in parts[0].text as a JSON string
  const text = candidate?.content?.parts?.[0]?.text;

  if (text) {
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to recover truncated JSON
      const start = cleaned.indexOf("{");
      if (start === -1) throw new Error("No JSON object found in response");
      const substr = cleaned.substring(start);

      let depth = 0;
      let lastSafe = 0;
      for (let i = 0; i < substr.length; i++) {
        if (substr[i] === "{" || substr[i] === "[") depth++;
        if (substr[i] === "}" || substr[i] === "]") {
          depth--;
          if (depth <= 1) lastSafe = i + 1;
        }
      }
      const truncated = substr.substring(0, lastSafe);
      const suffix = truncated.trimEnd().endsWith("]") ? "}" : "]}]}";
      return JSON.parse(truncated + suffix);
    }
  }

  // Path 2: inline data (some Gemini versions return inlineData)
  const inlineData = candidate?.content?.parts?.[0]?.inlineData?.data;
  if (inlineData) {
    return JSON.parse(Buffer.from(inlineData, "base64").toString("utf-8"));
  }

  throw new Error(
    `No content in Gemini response. Finish reason: ${candidate?.finishReason ?? "unknown"}`,
  );
}

function buildRequestBody(
  systemPrompt: string,
  userPrompt: string,
  schema: object,
) {
  return JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 10000,
      response_mime_type: "application/json",
      response_schema: schema,
    },
  });
}

async function callGeminiWithFallback(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  schema: object,
): Promise<Response> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildRequestBody(systemPrompt, userPrompt, schema),
      },
    );

    if (res.ok) return res;

    // Only retry on 429 (rate limit) or 503 (overloaded/unavailable)
    if (res.status !== 429 && res.status !== 503) {
      // 400, 401, 404 etc. — no point retrying different models
      throw new Error(`Gemini error ${res.status}`);
    }
  } catch (err: unknown) {
    throw err;
  }

  // spike error
  const spikeError = new Error("GEMINI_SPIKE");
  spikeError.name = "GEMINI_SPIKE";
  throw spikeError;
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = (req.headers.get("x-forwarded-for") ?? "anonymous")
      .split(",")[0]
      .trim();

    const { success: globalOk } = await globalLimiter.limit("global");
    if (!globalOk) {
      return NextResponse.json(
        { error: "Daily site capacity reached. Try again tomorrow." },
        { status: 429 },
      );
    }

    const { success: userOk, reset } = await ipLimiter.limit(ip);
    if (!userOk) {
      const hoursLeft = Math.ceil((reset - Date.now()) / 3_600_000);
      return NextResponse.json(
        {
          error: `Daily limit reached. Try again in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`,
        },
        { status: 429 },
      );
    }

    // Parse + validate input
    const body = await req.json();
    const data = InputSchema.parse(body);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "API not configured." },
        { status: 500 },
      );
    }

    const RESPONSE_SCHEMA = {
      type: "OBJECT",
      required: ["city", "days", "trip_total_cost"],
      properties: {
        city: { type: "STRING" },
        trip_total_cost: { type: "NUMBER" },
        days: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            required: ["day", "theme", "stops", "daily_total_cost"],
            properties: {
              day: { type: "NUMBER" },
              theme: { type: "STRING" },
              daily_total_cost: { type: "NUMBER" },
              stops: {
                type: "ARRAY",
                minItems: 4,
                maxItems: 6,
                items: {
                  type: "OBJECT",
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
                    name: { type: "STRING" },
                    type: {
                      type: "STRING",
                      enum: ["attraction", "food", "activity"],
                    },
                    lat: { type: "NUMBER" },
                    lng: { type: "NUMBER" },
                    duration_mins: { type: "NUMBER" },
                    entry_cost: { type: "NUMBER" },
                    notes: { type: "STRING" },
                    transport_from_previous: {
                      type: "OBJECT",
                      required: ["mode", "fare"],
                      properties: {
                        mode: {
                          type: "STRING",
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
                        line: { type: "STRING", nullable: true },
                        from_stop: { type: "STRING", nullable: true },
                        to_stop: { type: "STRING", nullable: true },
                        fare: { type: "NUMBER" },
                        walk_to_stop_mins: { type: "NUMBER", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Call Gemini
    let geminiRes: Response;
    try {
      geminiRes = await callGeminiWithFallback(
        apiKey,
        SYSTEM_PROMPT,
        buildUserPrompt(
          data.city,
          data.days,
          data.budget,
          data.travelStyle,
          data.mustVisit,
        ),
        RESPONSE_SCHEMA,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "GEMINI_SPIKE") {
        return Response.json(
          {
            error: "spike",
            message:
              "AI models are experiencing a spike in traffic. Please try again in a moment.",
          },
          { status: 503 },
        );
      }
      return Response.json({ error: "generation_failed" }, { status: 500 });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini HTTP error", geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return NextResponse.json(
          { error: "AI rate limited — try again in a moment." },
          { status: 429 },
        );
      }
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiJson = await geminiRes.json();

    // Log full response in dev to debug response shape
    if (process.env.NODE_ENV === "development") {
      console.log("Gemini raw response:", JSON.stringify(geminiJson, null, 2));
    }

    // Check for blocked/empty response
    if (!geminiJson.candidates?.length) {
      const blockReason = geminiJson.promptFeedback?.blockReason;
      console.error("Gemini blocked:", geminiJson);
      throw new Error(
        blockReason ? `Blocked: ${blockReason}` : "No response from AI.",
      );
    }

    const candidate = geminiJson.candidates[0];

    // Check finish reason — STOP is good, others need handling
    const finishReason = candidate.finishReason ?? candidate.finish_reason;
    if (finishReason && finishReason !== "STOP" && finishReason !== "stop") {
      console.error("Bad finish reason:", finishReason, candidate);
      if (finishReason === "MAX_TOKENS" || finishReason === "max_tokens") {
        // Still try to parse what we got
        console.warn("Response was truncated — attempting partial parse");
      } else {
        throw new Error(`Generation stopped: ${finishReason}`);
      }
    }

    const rawItinerary = extractJson(candidate);

    // Validate basic structure
    if (!rawItinerary?.days?.length) {
      throw new Error("AI returned empty itinerary — please try again.");
    }

    const corrected = enforceTransportModes(
      rawItinerary,
      data.city,
      data.travelStyle,
    );
    return NextResponse.json(corrected);
  } catch (e: any) {
    console.error("Route error:", e.message, e.stack);

    // Don't expose internal errors to client
    const userMessage = e.message?.includes("limit")
      ? e.message
      : e.message?.includes("Blocked")
        ? e.message
        : "Couldn't generate itinerary due to model experiencing high demand - please try again in a moment.";

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
