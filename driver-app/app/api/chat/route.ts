import { NextRequest, NextResponse } from "next/server";
import {
  originAllowed,
  forbidden,
  resolveModel,
  sanitiseMessages,
  edgeRateLimit,
  clientKey,
  tooManyRequests,
} from "@/lib/api-guard";

export const runtime = "edge";

// Server-side proxy for Anthropic API.
// API key is stored as ANTHROPIC_API_KEY env variable in Vercel — never exposed to browser.
//
// This route was previously an open relay: no origin check, no rate limit, and both
// `model` and `system` taken straight from the request body. Anyone could point it at
// the most expensive model with an arbitrary system prompt and bill it to this
// Anthropic account.
export async function POST(req: NextRequest) {
  if (!originAllowed(req)) return forbidden();

  if (!edgeRateLimit(`chat:${clientKey(req)}`, 20, 60_000)) {
    return tooManyRequests(60);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[chat] ANTHROPIC_API_KEY not configured");
    return NextResponse.json({ error: "Assistant is unavailable." }, { status: 503 });
  }

  try {
    const body = await req.json();
    const messages = sanitiseMessages(body?.messages);

    if (!messages) {
      return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
    }

    // The system prompt is composed here, server-side. A caller-supplied `system` is
    // ignored: accepting one let anyone repurpose the key for arbitrary generation.
    const system =
      "You are the assistant for Square Transportation Solution Inc (MC-728978, DOT-2089206), " +
      "a Conestoga flatbed carrier based in Naperville, Illinois. You help CDL drivers complete " +
      "an FMCSA-compliant employment application.\n\n" +
      "Be concise and plain-spoken. Answer DOT and FMCSA questions directly, citing 49 CFR " +
      "Parts 382, 383 and 391 where it helps.\n\n" +
      "You are not a lawyer and you do not decide who is hired. If a driver asks whether a " +
      "past event disqualifies them, explain what the rule says and tell them a recruiter will " +
      "review it — never tell them they are disqualified or that they are cleared.\n\n" +
      "Never ask for a Social Security number, bank account number, or routing number in chat. " +
      "Those are entered in the form fields only. If a driver types one anyway, tell them not " +
      "to send it in chat and point them at the field.";

    const payload = {
      model: resolveModel(body?.model),
      max_tokens: 1024,
      system,
      messages,
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Log upstream detail; do not return it. The upstream body can echo the request
      // and can disclose account state to an anonymous caller.
      const txt = await res.text();
      console.error(`[chat] Anthropic API ${res.status}: ${txt.slice(0, 500)}`);
      return NextResponse.json({ error: "Assistant is unavailable right now." }, { status: 502 });
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    // `raw` is deliberately not returned — it leaked full upstream response metadata,
    // including token accounting, to the browser.
    return NextResponse.json({ text });
  } catch (e: any) {
    console.error(`[chat] ${e?.message || "unknown error"}`);
    return NextResponse.json({ error: "Assistant is unavailable right now." }, { status: 500 });
  }
}
