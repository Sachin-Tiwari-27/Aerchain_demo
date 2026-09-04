# Milestone 5: Five AI Use-cases

## Overview
The provider abstraction in `src/ai/provider.ts` now exposes five distinct use-cases. Each has its own primary/secondary model env vars and is routed from a single call site.

## Use-case map

| # | Use-case | Triggered by | Env vars |
|---|---|---|---|
| 1 | `image-parse` | `extractVendorDocument` and `/api/extract` when `documentKind` is image or PDF | `GEMINI_IMAGE_PRIMARY_MODEL`, `GEMINI_IMAGE_SECONDARY_MODEL` (+ optional OpenRouter) |
| 2 | `rfx-json` | Text-derived quote extraction in `extractVendorDocument`, `/api/extract`, and `generateWithTools` | `GEMINI_RFX_PRIMARY_MODEL`, `GEMINI_RFX_SECONDARY_MODEL` |
| 3 | `rfx-draft` | `/api/rfx-builder` `build_from_message` (buyer message -> RFx description/category) | `OPENROUTER_RFX_DRAFT_PRIMARY_MODEL`, `GEMINI_RFX_DRAFT_PRIMARY_MODEL`, `GEMINI_RFX_DRAFT_SECONDARY_MODEL` |
| 4 | `analyst-intent` | `/api/analyst-tool` when no explicit `toolName` (question -> tool selection) | `GEMINI_ANALYST_INTENT_PRIMARY_MODEL`, `GEMINI_ANALYST_INTENT_SECONDARY_MODEL` |
| 5 | `analyst-recommendation` | `/api/analyst-tool` `recommend_award` (scenario -> buyer-facing narrative) | `GEMINI_ANALYST_RECOMMENDATION_PRIMARY_MODEL`, `GEMINI_ANALYST_RECOMMENDATION_SECONDARY_MODEL` |

## Provider chain policy
- Procurement-signal use-cases (`rfx-json`, `analyst-intent`, `analyst-recommendation`) are Gemini-only. No OpenRouter fallback is used.
- `image-parse` keeps the full Gemini -> OpenRouter chain because it is the only multi-modal flow and benefits from extra resilience.
- `rfx-draft` uses a custom chain: `openrouter-primary` (default `minimax/minimax-m3:free`) -> `gemini-primary` -> `gemini-secondary`. There is no openrouter-secondary for rfx-draft by design, to keep drafts cheap. If `OPENROUTER_RFX_DRAFT_PRIMARY_MODEL` is empty or the OpenRouter key is missing, the chain skips straight to Gemini.

## Default model picks
- `image-parse` primary: `gemini-3.7-flash` (vision capable).
- `rfx-json` primary: `gemini-3.6-flash` (strict, reasoning-grade).
- `rfx-draft` openrouter-primary: `minimax/minimax-m3:free`. Gemini fallback: `gemini-3.5-flash` -> `gemini-3.5-flash-lite`.
- `analyst-intent` primary: `gemini-3.5-flash-lite` (single-shot classifier).
- `analyst-recommendation` primary: `gemini-3.5-flash` (mid-tier prose).

Defaults are documentation values; real deployments can override them without a code change.

## Vercel setup
Add every model env var listed above (plus the image pair) in Project Settings -> Environment Variables. Each use-case must have a non-empty primary model, otherwise the API returns a `No model configured` error.
