import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Server-side proxy for Anthropic API.
// API key is stored as ANTHROPIC_API_KEY env variable in Vercel — never exposed to browser.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on server" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { messages, system, model } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
    }

    const payload: any = {
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages,
    };
    if (system) payload.system = system;

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
      const txt = await res.text();
      return NextResponse.json(
        { error: `Anthropic API ${res.status}: ${txt.slice(0, 500)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return NextResponse.json({ text, raw: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
