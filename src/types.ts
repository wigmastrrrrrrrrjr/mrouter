export interface Model {
  id: string;
  name: string;
  provider: string;
  free: boolean;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface Message {
  role: string;
  content: string;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Choice[];
  usage: Usage;
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ModelsResponse {
  data: Model[];
}

export interface ProviderConfig {
  baseUrl: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  freeOnly: boolean;
  blockedPatterns: string[];
}

export interface RoutingConfig {
  maxRetries: number;
  rateLimitWindow: number;
  maxRequestsPerWindow: number;
  tokenBudgetPerRequest: number;
}