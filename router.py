import time
from typing import Dict, List, Optional
from dataclasses import dataclass, field

from config import ROUTING_CONFIG, GENERIC_ERROR_MESSAGE
from providers import Provider, ModelError, is_model_error, create_providers
from models import Model, ChatRequest, ChatResponse


@dataclass
class RateLimitEntry:
    timestamps: List[float] = field(default_factory=list)


class ModelRouter:
    def __init__(self, ollama_key: str, openrouter_key: str):
        self.providers = create_providers(ollama_key, openrouter_key)
        self.rate_limits: Dict[str, RateLimitEntry] = {}
        self.model_usage: Dict[str, int] = {}

    def _check_rate_limit(self, provider_name: str) -> bool:
        now = time.time() * 1000
        window = ROUTING_CONFIG.rate_limit_window
        max_reqs = ROUTING_CONFIG.max_requests_per_window

        if provider_name not in self.rate_limits:
            self.rate_limits[provider_name] = RateLimitEntry()

        entry = self.rate_limits[provider_name]
        cutoff = now - window
        entry.timestamps = [t for t in entry.timestamps if t > cutoff]

        if len(entry.timestamps) >= max_reqs:
            return False

        entry.timestamps.append(now)
        return True

    async def get_available_models(self) -> List[Model]:
        all_models = []
        for provider in self.providers.values():
            if not provider.is_healthy():
                print(f"[mrouter] {provider.name}: skipped (unhealthy)", flush=True)
                continue
            try:
                models = await provider.get_models()
                all_models.extend(models)
            except Exception as e:
                print(f"[mrouter] {provider.name}: get_models failed", flush=True)
                provider.mark_unhealthy()
        return all_models

    async def chat(self, req: ChatRequest) -> ChatResponse:
        model_key = req.model

        for attempt in range(ROUTING_CONFIG.max_retries + 1):
            provider = await self._select_provider(model_key)
            if not provider:
                raise ModelError("", model_key)

            if not self._check_rate_limit(provider.name):
                continue

            self.model_usage[model_key] = self.model_usage.get(model_key, 0) + 1

            try:
                return await provider.chat(req)
            except Exception as e:
                if is_model_error(e):
                    continue
                raise

        raise ModelError("", model_key)

    async def _select_provider(self, model_name: str) -> Optional[Provider]:
        for provider in self.providers.values():
            if not provider.is_healthy():
                continue
            try:
                models = await provider.get_models()
                if any(m.id == model_name for m in models):
                    return provider
            except Exception:
                continue

        for provider in self.providers.values():
            if provider.is_healthy():
                return provider

        return None

    def get_usage_stats(self) -> Dict[str, int]:
        return dict(self.model_usage)