import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceTransportModes,
  parseItineraryJson,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "@/lib/itinerary";

const InputSchema = z.object({
  city: z.string().min(1).max(120),
  days: z.number().int().min(1).max(7),
  budget: z.enum(["budget", "mid", "comfort"]),
  travelStyle: z.enum(["public", "walking", "mixed"]),
  mustVisit: z.array(z.string().max(120)).max(10).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = InputSchema.parse(body);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 },
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserPrompt(
              data.city,
              data.days,
              data.budget,
              data.travelStyle,
              data.mustVisit,
            ),
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Anthropic API error", res.status, text);
      if (res.status === 429)
        return NextResponse.json(
          { error: "Rate limited — please wait and try again." },
          { status: 429 },
        );
      return NextResponse.json(
        { error: "Couldn't generate itinerary — try again." },
        { status: 500 },
      );
    }

    const json = await res.json();
    const content = json.content?.[0]?.text;
    if (!content) {
      return NextResponse.json(
        { error: "Empty response from AI — try again." },
        { status: 500 },
      );
    }

    const parsed = parseItineraryJson(content);
    const corrected = enforceTransportModes(
      parsed,
      data.city,
      data.travelStyle,
    );

    return NextResponse.json(corrected);
  } catch (e) {
    console.error("generate-itinerary error:", e);
    const message =
      e instanceof z.ZodError
        ? "Invalid input: " + e.errors.map((err) => err.message).join(", ")
        : e instanceof Error
          ? e.message
          : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
