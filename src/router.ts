import type { Model, ChatRequest, ChatResponse } from "./types";
import { createProviders, ModelError, isModelError, type Provider } from "./providers";
import { ROUTING_CONFIG } from "./config";

interface RateLimitEntry {
  timestamps: number[];
}

export class ModelRouter {
  private providers: Map<string, Provider>;
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private modelUsage: Map<string, number> = new Map();

  constructor(env: { OLLAMA_CLOUD_API_KEY?: string; OPENROUTER_API_KEY?: string }) {
    this.providers = createProviders(env);
  }

  private checkRateLimit(providerName: string): boolean {
    const now = Date.now();
    const window = ROUTING_CONFIG.rateLimitWindow;
    const maxReqs = ROUTING_CONFIG.maxRequestsPerWindow;

    let entry = this.rateLimits.get(providerName);
    if (!entry) {
      entry = { timestamps: [] };
      this.rateLimits.set(providerName, entry);
    }

    const cutoff = now - window;
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= maxReqs) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  async getAvailableModels(): Promise<Model[]> {
    const allModels: Model[] = [];

    for (const [, provider] of this.providers) {
      if (!provider.isHealthy()) continue;
      try {
        const models = await provider.getModels();
        allModels.push(...models);
      } catch {
        provider.markUnhealthy();
      }
    }

    return allModels;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const modelKey = req.model;

    for (let attempt = 0; attempt <= ROUTING_CONFIG.maxRetries; attempt++) {
      const provider = await this.selectProvider(modelKey);
      if (!provider) {
        throw new ModelError("", modelKey);
      }

      if (!this.checkRateLimit(provider.name)) {
        continue;
      }

      this.modelUsage.set(modelKey, (this.modelUsage.get(modelKey) || 0) + 1);

      try {
        return await provider.chat(req);
      } catch (error) {
        if (isModelError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ModelError("", modelKey);
  }

  private async selectProvider(modelName: string): Promise<Provider | null> {
    for (const [, provider] of this.providers) {
      if (!provider.isHealthy()) continue;
      try {
        const models = await provider.getModels();
        if (models.some((m) => m.id === modelName)) {
          return provider;
        }
      } catch {
        continue;
      }
    }

    for (const [, provider] of this.providers) {
      if (provider.isHealthy()) return provider;
    }

    return null;
  }

  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [k, v] of this.modelUsage) {
      stats[k] = v;
    }
    return stats;
  }
}