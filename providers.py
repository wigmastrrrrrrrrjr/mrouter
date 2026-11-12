import time
import httpx
from typing import Dict, List, Optional
from dataclasses import dataclass, field

from config import ProviderConfig, GENERIC_ERROR_MESSAGE
from models import Model, ChatRequest, ChatResponse, ModelsResponse


class ModelError(Exception):
    def __init__(self, provider: str, model: str, original_error: Optional[Exception] = None):
        self.provider = provider
        self.model = model
        self.original_error = original_error
        super().__init__(GENERIC_ERROR_MESSAGE)


def is_model_error(error: Exception) -> bool:
    return isinstance(error, ModelError)


@dataclass
class Provider:
    name: str
    config: ProviderConfig
    api_key: str
    healthy: bool = True
    cached_models: List[Model] = field(default_factory=list)
    client: httpx.AsyncClient = field(default_factory=lambda: httpx.AsyncClient(timeout=10.0))

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.name == "openrouter":
            headers["HTTP-Referer"] = "https://mrouter.local"
            headers["X-Title"] = "mrouter"
        return headers

    def _matches_pattern(self, model_id: str, pattern: str) -> bool:
        return pattern in model_id

    def _is_blocked(self, model_id: str) -> bool:
        return any(self._matches_pattern(model_id, p) for p in self.config.blocked_patterns)

    async def get_models(self) -> List[Model]:
        if self.cached_models:
            return self.cached_models

        url = f"{self.config.base_url}{self.config.models_endpoint}"
        try:
            response = await self.client.get(url, headers=self._headers())
            response.raise_for_status()
            data = response.json()

            raw_models = data.get("data", [])
            filtered = []
            for m in raw_models:
                pricing = m.get("pricing", {"prompt": 0.0, "completion": 0.0})
                prompt_price = float(pricing.get("prompt", 0) or 0)
                completion_price = float(pricing.get("completion", 0) or 0)
                
                model = Model(
                    id=m.get("id", ""),
                    name=m.get("name", m.get("id", "")),
                    free=m.get("free", False),
                    context_length=m.get("context_length", 0),
                    pricing={"prompt": prompt_price, "completion": completion_price},
                )
                if self.config.free_only and not model.free:
                    continue
                if self._is_blocked(model.id):
                    continue
                if self.name == "openrouter":
                    if model.pricing.get("prompt", 0) > 0.001 or model.pricing.get("completion", 0) > 0.001:
                        continue
                model.provider = self.name
                filtered.append(model)

            self.cached_models = filtered
            self.healthy = True
            return filtered
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500:
                self.healthy = False
            raise ModelError(self.name, "", e)
        except Exception as e:
            self.healthy = False
            raise ModelError(self.name, "", e)

    async def chat(self, req: ChatRequest) -> ChatResponse:
        url = f"{self.config.base_url}{self.config.chat_endpoint}"
        try:
            response = await self.client.post(
                url,
                headers=self._headers(),
                json=req.model_dump(exclude_none=True),
            )
            response.raise_for_status()
            data = response.json()
            self.healthy = True
            return ChatResponse(**data)
        except Exception as e:
            self.healthy = False
            raise ModelError(self.name, req.model, e)

    def is_healthy(self) -> bool:
        return self.healthy

    def mark_unhealthy(self):
        self.healthy = False

    def mark_healthy(self):
        self.healthy = True


def create_providers(ollama_key: str, openrouter_key: str) -> Dict[str, Provider]:
    providers = {}
    if ollama_key:
        providers["ollamacloud"] = Provider(
            name="ollamacloud",
            config=ProviderConfig(
                base_url="https://api.ollama.cloud/v1",
                models_endpoint="/models",
                chat_endpoint="/chat/completions",
                free_only=True,
                blocked_patterns=[],
            ),
            api_key=ollama_key,
        )
    if openrouter_key:
        providers["openrouter"] = Provider(
            name="openrouter",
            config=ProviderConfig(
                base_url="https://openrouter.ai/api/v1",
                models_endpoint="/models",
                chat_endpoint="/chat/completions",
                free_only=False,
                blocked_patterns=[
                    "gpt-4",
                    "gpt-3.5",
                    "claude-3-opus",
                    "claude-3-sonnet",
                    "claude-3.5-sonnet",
                ],
            ),
            api_key=openrouter_key,
        )
    return providers