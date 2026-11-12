import os
import yaml
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class ProviderConfig:
    base_url: str
    models_endpoint: str
    chat_endpoint: str
    free_only: bool
    blocked_patterns: List[str]


@dataclass
class RoutingConfig:
    max_retries: int = 3
    rate_limit_window: int = 60000
    max_requests_per_window: int = 10
    token_budget_per_request: int = 10000


PROVIDER_CONFIGS: Dict[str, ProviderConfig] = {
    "ollamacloud": ProviderConfig(
        base_url="https://api.ollama.cloud/v1",
        models_endpoint="/models",
        chat_endpoint="/chat/completions",
        free_only=True,
        blocked_patterns=[],
    ),
    "openrouter": ProviderConfig(
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
}

ROUTING_CONFIG = RoutingConfig()

GENERIC_ERROR_MESSAGE = "This model has errored. This is an issue with the provider and not with us"


def get_env(key: str, default: str = "") -> str:
    return os.getenv(key, default)