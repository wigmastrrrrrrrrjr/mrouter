import type { Model, ChatRequest, ChatResponse, ModelsResponse, ProviderConfig } from "./types";
import { GENERIC_ERROR_MESSAGE } from "./config";

export class ModelError extends Error {
  provider: string;
  model: string;
  originalError: Error | null;

  constructor(provider: string, model: string, originalError: Error | null = null) {
    super(GENERIC_ERROR_MESSAGE);
    this.name = "ModelError";
    this.provider = provider;
    this.model = model;
    this.originalError = originalError;
  }
}

export function isModelError(error: unknown): error is ModelError {
  return error instanceof ModelError;
}

interface Provider {
  name: string;
  getModels(): Promise<Model[]>;
  chat(req: ChatRequest): Promise<ChatResponse>;
  isHealthy(): boolean;
  markUnhealthy(): void;
  markHealthy(): void;
}

function createProvider(
  name: string,
  config: ProviderConfig,
  apiKey: string
): Provider {
  let healthy = true;
  let cachedModels: Model[] = [];

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(name === "openrouter" && {
      "HTTP-Referer": "https://mrouter.local",
      "X-Title": "mrouter",
    }),
  };

  async function fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout = 60000
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  function matchesPattern(modelId: string, pattern: string): boolean {
    return modelId.includes(pattern);
  }

  function isBlocked(modelId: string): boolean {
    return config.blockedPatterns.some((p) => matchesPattern(modelId, p));
  }

  return {
    name,
    async getModels(): Promise<Model[]> {
      if (cachedModels.length > 0) return cachedModels;

      const url = `${config.baseUrl}${config.modelsEndpoint}`;
      const response = await fetchWithTimeout(url, { headers });

      if (!response.ok) {
        healthy = false;
        throw new ModelError(name, "", new Error(`HTTP ${response.status}`));
      }

      const data = (await response.json()) as ModelsResponse;
      const filtered = data.data
        .filter((m) => {
          if (config.freeOnly && !m.free) return false;
          if (isBlocked(m.id)) return false;
          if (name === "openrouter") {
            return m.pricing.prompt <= 0.001 && m.pricing.completion <= 0.001;
          }
          return true;
        })
        .map((m) => ({ ...m, provider: name }));

      cachedModels = filtered;
      healthy = true;
      return filtered;
    },

    async chat(req: ChatRequest): Promise<ChatResponse> {
      const url = `${config.baseUrl}${config.chatEndpoint}`;
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        healthy = false;
        throw new ModelError(name, req.model, new Error(`HTTP ${response.status}`));
      }

      const data = (await response.json()) as ChatResponse;
      healthy = true;
      return data;
    },

    isHealthy(): boolean {
      return healthy;
    },

    markUnhealthy(): void {
      healthy = false;
    },

    markHealthy(): void {
      healthy = true;
    },
  };
}

export function createProviders(
  env: { OLLAMA_CLOUD_API_KEY?: string; OPENROUTER_API_KEY?: string }
): Map<string, Provider> {
  const providers = new Map<string, Provider>();

  if (env.OLLAMA_CLOUD_API_KEY) {
    providers.set(
      "ollamacloud",
      createProvider("ollamacloud", PROVIDER_CONFIGS.ollamacloud, env.OLLAMA_CLOUD_API_KEY)
    );
  }

  if (env.OPENROUTER_API_KEY) {
    providers.set(
      "openrouter",
      createProvider("openrouter", PROVIDER_CONFIGS.openrouter, env.OPENROUTER_API_KEY)
    );
  }

  return providers;
}

import { PROVIDER_CONFIGS } from "./config";