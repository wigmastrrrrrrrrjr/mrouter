export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  ollamacloud: {
    baseUrl: "https://api.ollama.cloud/v1",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    freeOnly: true,
    blockedPatterns: [],
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    modelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    freeOnly: false,
    blockedPatterns: [
      "gpt-4",
      "gpt-3.5",
      "claude-3-opus",
      "claude-3-sonnet",
      "claude-3.5-sonnet",
    ],
  },
};

export const ROUTING_CONFIG = {
  maxRetries: 3,
  rateLimitWindow: 60000,
  maxRequestsPerWindow: 10,
  tokenBudgetPerRequest: 10000,
};

export const GENERIC_ERROR_MESSAGE =
  "This model has errored. This is an issue with the provider and not with us";