import { z } from "zod";

export type DocumentKind = "image" | "pdf" | "text-derived";
export type ProviderName = "gemini-primary" | "gemini-secondary" | "openrouter-primary" | "openrouter-secondary";

export function providerTag(provider: ProviderName): "GP" | "GS" | "OP" | "OS" {
  switch (provider) {
    case "gemini-primary": return "GP";
    case "gemini-secondary": return "GS";
    case "openrouter-primary": return "OP";
    case "openrouter-secondary": return "OS";
  }
}
export type UseCase =
  | "image-parse"
  | "rfx-json"
  | "rfx-draft"
  | "analyst-intent"
  | "analyst-recommendation";

export type StructuredGenerationResult<T> = {
  data: T;
  provider: ProviderName;
  model: string;
  fallbackAttempts: number;
  provenance: {
    documentKind: DocumentKind;
    useCase: UseCase;
    promptVariant: "primary" | "strict-retry";
    providerChain: ProviderName[];
    usedProvider: ProviderName;
  };
};

export type GenerateStructuredOptions<T> = {
  schema: z.ZodType<T>;
  prompt: string;
  documentKind?: DocumentKind;
  useCase?: UseCase;
  media?: { mimeType: string; data: string };
  onInvalid?: (result: unknown) => string;
};

export type ToolGenerationOptions<T> = {
  schema: z.ZodType<T>;
  prompt: string;
  tools?: unknown[];
};

function getEnv() {
  return {
    googleApiKey: process.env.GOOGLE_API_KEY ?? "",
    openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    // Image parse models
    geminiImagePrimaryModel: process.env.GEMINI_IMAGE_PRIMARY_MODEL ?? "",
    geminiImageSecondaryModel: process.env.GEMINI_IMAGE_SECONDARY_MODEL ?? "",
    openRouterImagePrimaryModel: process.env.OPENROUTER_IMAGE_PRIMARY_MODEL ?? "minimax/minimax-m3:free",
    openRouterImageSecondaryModel: process.env.OPENROUTER_IMAGE_SECONDARY_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free",
    // RFx JSON models (strict text-derived extraction + RFx structurer)
    geminiRfxPrimaryModel: process.env.GEMINI_RFX_PRIMARY_MODEL ?? "",
    geminiRfxSecondaryModel: process.env.GEMINI_RFX_SECONDARY_MODEL ?? "",
    openRouterRfxPrimaryModel: process.env.OPENROUTER_RFX_PRIMARY_MODEL ?? "minimax/minimax-m3:free",
    openRouterRfxSecondaryModel: process.env.OPENROUTER_RFX_SECONDARY_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free",
    // RFx drafting (conversational buyer message -> RFx description/category)
    geminiRfxDraftPrimaryModel: process.env.GEMINI_RFX_DRAFT_PRIMARY_MODEL ?? "gemini-3.5-flash",
    geminiRfxDraftSecondaryModel: process.env.GEMINI_RFX_DRAFT_SECONDARY_MODEL ?? "gemini-3.5-flash-lite",
    openRouterRfxDraftPrimaryModel: process.env.OPENROUTER_RFX_DRAFT_PRIMARY_MODEL ?? "minimax/minimax-m3:free",
    openRouterRfxDraftSecondaryModel: process.env.OPENROUTER_RFX_DRAFT_SECONDARY_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free",
    // Analyst intent routing (question -> tool name)
    geminiAnalystIntentPrimaryModel: process.env.GEMINI_ANALYST_INTENT_PRIMARY_MODEL || "gemini-3.5-flash-lite",
    geminiAnalystIntentSecondaryModel: process.env.GEMINI_ANALYST_INTENT_SECONDARY_MODEL || "gemini-3.5-flash-lite",
    openRouterAnalystIntentPrimaryModel: process.env.OPENROUTER_ANALYST_INTENT_PRIMARY_MODEL || process.env.OPENROUTER_RFX_DRAFT_PRIMARY_MODEL || "minimax/minimax-m3:free",
    openRouterAnalystIntentSecondaryModel: process.env.OPENROUTER_ANALYST_INTENT_SECONDARY_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
    // Analyst recommendation (award narrative)
    geminiAnalystRecommendationPrimaryModel:
      process.env.GEMINI_ANALYST_RECOMMENDATION_PRIMARY_MODEL ?? "",
    geminiAnalystRecommendationSecondaryModel:
      process.env.GEMINI_ANALYST_RECOMMENDATION_SECONDARY_MODEL ?? "gemini-3.5-flash-lite",
    openRouterAnalystRecommendationPrimaryModel:
      process.env.OPENROUTER_ANALYST_RECOMMENDATION_PRIMARY_MODEL ?? "minimax/minimax-m3:free",
    openRouterAnalystRecommendationSecondaryModel:
      process.env.OPENROUTER_ANALYST_RECOMMENDATION_SECONDARY_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free",
  };
}

function getProviderChain(useCase: UseCase): ProviderName[] {
  const env = getEnv();
  const hasGoogle = !!env.googleApiKey;
  const hasOpenRouter = !!env.openRouterApiKey;

  // RFx drafting starts with OpenRouter, then falls back through OpenRouter
  // secondary and both Gemini models.
  if (useCase === "rfx-draft") {
    const chain: ProviderName[] = [];
    if (hasOpenRouter && env.openRouterRfxDraftPrimaryModel) chain.push("openrouter-primary");
    if (hasOpenRouter && env.openRouterRfxDraftSecondaryModel) chain.push("openrouter-secondary");
    if (hasGoogle && env.geminiRfxDraftPrimaryModel) chain.push("gemini-primary");
    if (hasGoogle && env.geminiRfxDraftSecondaryModel) chain.push("gemini-secondary");
    return chain;
  }

  // All other tasks use the shared Gemini-primary -> Gemini-secondary ->
  // OpenRouter-primary -> OpenRouter-secondary fallback order.
  const chain: ProviderName[] = [];
  if (hasGoogle) chain.push("gemini-primary", "gemini-secondary");
  if (hasOpenRouter) chain.push("openrouter-primary", "openrouter-secondary");
  return chain;
}

function getModel(provider: ProviderName, useCase: UseCase): string {
  const env = getEnv();

  switch (useCase) {
    case "image-parse":
      switch (provider) {
        case "gemini-primary":
          return env.geminiImagePrimaryModel;
        case "gemini-secondary":
          return env.geminiImageSecondaryModel;
        case "openrouter-primary":
          return env.openRouterImagePrimaryModel;
        case "openrouter-secondary":
          return env.openRouterImageSecondaryModel;
      }
      break;
    case "rfx-json":
      switch (provider) {
        case "gemini-primary":
          return env.geminiRfxPrimaryModel;
        case "gemini-secondary":
          return env.geminiRfxSecondaryModel;
        case "openrouter-primary":
          return env.openRouterRfxPrimaryModel;
        case "openrouter-secondary":
          return env.openRouterRfxSecondaryModel;
      }
      break;
    case "rfx-draft":
      switch (provider) {
        case "gemini-primary":
          return env.geminiRfxDraftPrimaryModel;
        case "gemini-secondary":
          return env.geminiRfxDraftSecondaryModel;
        case "openrouter-primary":
          return env.openRouterRfxDraftPrimaryModel;
        case "openrouter-secondary":
          return env.openRouterRfxDraftSecondaryModel;
      }
      break;
    case "analyst-intent":
      switch (provider) {
        case "gemini-primary":
          return env.geminiAnalystIntentPrimaryModel;
        case "gemini-secondary":
          return env.geminiAnalystIntentSecondaryModel;
        case "openrouter-primary":
          return env.openRouterAnalystIntentPrimaryModel;
        case "openrouter-secondary":
          return env.openRouterAnalystIntentSecondaryModel;
      }
      break;
    case "analyst-recommendation":
      switch (provider) {
        case "gemini-primary":
          return env.geminiAnalystRecommendationPrimaryModel;
        case "gemini-secondary":
          return env.geminiAnalystRecommendationSecondaryModel;
        case "openrouter-primary":
          return env.openRouterAnalystRecommendationPrimaryModel;
        case "openrouter-secondary":
          return env.openRouterAnalystRecommendationSecondaryModel;
      }
      break;
  }
  throw new Error(`No model configured for ${provider} + ${useCase}`);
}

function strictifyPrompt(prompt: string): string {
  return `${prompt}\n\nReturn valid JSON only. Do not include markdown fences. The top-level response must be a JSON object, never an array. Be strict: if information is missing, use null/empty arrays; never invent a price or currency.`;
}

function parseJsonPayload(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("Empty response from model");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed;

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      return {
        vendor: "unknown",
        quotes: parsed,
        questionnaire_answers: [],
        commercial_terms: [],
        exceptions: ["Model returned array at root; wrapped into default object for schema compatibility."],
      };
    }
    return parsed;
  } catch (error) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw error;
  }
}

async function callGemini(prompt: string, model: string, documentKind: DocumentKind, media?: { mimeType: string; data: string }) {
  const env = getEnv();
  const apiKey = env.googleApiKey;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  if (!model) {
    throw new Error("Gemini model is not configured");
  }

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  parts.push({ text: prompt });

  if (media) {
    parts.push({ inline_data: { mime_type: media.mimeType, data: media.data } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const chunks = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = chunks.map((part: { text?: string }) => part.text ?? "").join("\n");
  
  // Debug: log raw response for extraction issues
  if (text && text.length < 1000) {
    console.error(`[Gemini ${model}] Raw response:`, text);
  }
  
  return parseJsonPayload(text);
}

async function callOpenRouter(prompt: string, model: string, provider: "openrouter-primary" | "openrouter-secondary", media?: { mimeType: string; data: string }) {
  const env = getEnv();
  const apiKey = env.openRouterApiKey;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  if (!model) {
    throw new Error(`${provider} model is not configured`);
  }

  const userContent = media
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${media.mimeType};base64,${media.data}` } },
      ]
    : prompt;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Aerchain Demo",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a structured extraction assistant. Return only valid JSON that matches the requested schema. Never invent missing values.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? "{}";
  return parseJsonPayload(content);
}

async function callProvider(
  provider: ProviderName,
  prompt: string,
  model: string,
  documentKind: DocumentKind,
  media?: { mimeType: string; data: string },
): Promise<unknown> {
  switch (provider) {
    case "gemini-primary":
    case "gemini-secondary":
      return callGemini(prompt, model, documentKind, media);
    case "openrouter-primary":
      return callOpenRouter(prompt, model, "openrouter-primary", media);
    case "openrouter-secondary":
      return callOpenRouter(prompt, model, "openrouter-secondary", media);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function generateStructured<T>({
  schema,
  prompt,
  documentKind = "text-derived",
  useCase = "rfx-json",
  media,
}: GenerateStructuredOptions<T>): Promise<StructuredGenerationResult<T>> {
  const chain = getProviderChain(useCase);
  let lastError: unknown;
  let lastProvider: ProviderName | null = null;
  let lastModel = "";
  let schemaFailed = false;

  for (const provider of chain) {
    if (schemaFailed) break;
    const model = getModel(provider, useCase);
    lastProvider = provider;
    lastModel = model;

    const attempts = [prompt, strictifyPrompt(prompt)];

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      try {
        const result = await callProvider(provider, attempts[attemptIndex], model, documentKind, media);
        const parsed = schema.safeParse(result);

        if (!parsed.success) {
          if (attemptIndex === 0) {
            lastError = parsed.error;
            continue;
          }

          // If the second attempt is still not a valid schema match, stop
          // here and do not fall through to a different provider. The
          // model gave us a well-formed JSON object but it does not fit
          // the requested contract; that is an application-level issue,
          // not a transient provider failure, and another provider is
          // extremely unlikely to produce a better match.
          schemaFailed = true;
          throw new Error(`Schema validation failed on ${provider}: ${parsed.error.message}`);
        }

        return {
          data: parsed.data as T,
          provider,
          model,
          fallbackAttempts: Math.max(0, chain.indexOf(provider)),
          provenance: {
            documentKind,
            useCase,
            promptVariant: attemptIndex === 0 ? "primary" : "strict-retry",
            providerChain: chain,
            usedProvider: provider,
          },
        };
      } catch (error) {
        lastError = error;
        if (attemptIndex === 0) {
          continue;
        }
        break;
      }
    }
  }

  throw new Error(
    `No provider in the chain produced a valid extraction for ${useCase} [${lastProvider ? providerTag(lastProvider) : "AI"} ${lastModel || "unknown model"}]. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function generateWithTools<T>({ schema, prompt, tools }: ToolGenerationOptions<T>) {
  // This is intentionally separate from structured extraction.
  // Tool-calling flows for RFx builder / analyst use dedicated modules instead of the extraction abstraction.
  void tools;

  return generateStructured<T>({
    schema,
    prompt,
    documentKind: "text-derived",
    useCase: "rfx-json",
  });
}
