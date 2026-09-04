# Aerchain Procurement Demo

Next.js procurement workflow demo for RFx drafting, supplier response extraction, quote normalization, evidence review, analyst questions, and award recommendations.
## Vercel deployment

1. Push this repository to GitHub.
2. Import the repository into Vercel and keep the detected Next.js framework and default `next build` command.
3. Add every variable from `.env.example` in Vercel Project Settings -> Environment Variables for Preview and Production as appropriate.
4. Apply the Supabase schema and run the seed command from a trusted local environment.
5. Redeploy after changing environment variables.

Never commit `.env.local` or expose `GOOGLE_API_KEY` and service-role credentials with a `NEXT_PUBLIC_` prefix. Review Supabase RLS and API authentication before making a production deployment public.

## AI use-cases

There are five use-cases, each with its own primary/secondary model env vars:

- `image-parse` (image/PDF extraction) — Gemini primary/secondary, then OpenRouter primary/secondary.
- `rfx-json` (text-derived quote extraction) — Gemini primary/secondary, then OpenRouter primary/secondary.
- `rfx-draft` (RFx builder from a buyer message) — OpenRouter primary/secondary first, then Gemini primary/secondary.
- `analyst-intent` (analyst question to tool name) — Gemini primary/secondary, then OpenRouter primary/secondary.
- `analyst-recommendation` (award narrative) — Gemini primary/secondary, then OpenRouter primary/secondary.

The default OpenRouter pair is `minimax/minimax-m3:free` followed by `nvidia/nemotron-3-ultra-550b-a55b:free`.

## Routes

- `/rfx/[id]/build` RFx builder and approval flow
- `/responses` supplier document intake and extraction
- `/compare` normalized quote comparison and evidence drawer
- `/ask` analyst questions, award scenario, and recommendation
