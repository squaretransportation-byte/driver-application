# Square Transportation — Driver Application

FMCSA-compliant driver onboarding portal with AI-powered interview mode.

## Tech

- Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS
- Anthropic API via server-side Edge route (`/api/chat`)
- Web Speech API for voice input
- localStorage for progress auto-save

## Required Environment Variable

In Vercel project settings → Environment Variables, add:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Apply to Production, Preview, and Development. Without this, AI features and Interview Mode will return errors.

## Models

- Chat assistant: `claude-haiku-4-5-20251001`
- Voice apply / structured extraction: `claude-sonnet-4-6`

## Local Dev

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

## Architecture

- `app/page.tsx` — single-page client component (entire UI)
- `app/api/chat/route.ts` — Edge function that proxies to Anthropic
- `app/layout.tsx` — root layout with global fonts/CSS
- `app/globals.css` — Tailwind + brand styles

The browser never sees the API key — every Anthropic call goes `client → /api/chat → api.anthropic.com`.

---
Square Transportation Solution Inc · MC-728978 · DOT-2089206
