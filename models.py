from typing import List, Optional
from dataclasses import dataclass, field, asdict
import json


@dataclass
class Model:
    id: str
    name: str
    provider: str = ""
    free: bool = False
    context_length: int = 0
    pricing: dict = field(default_factory=lambda: {"prompt": 0.0, "completion": 0.0})

    def model_dump(self):
        return asdict(self)


@dataclass
class Message:
    role: str
    content: str


@dataclass
class ChatRequest:
    model: str
    messages: List[Message]
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: Optional[bool] = None

    def model_dump(self, exclude_none=False):
        data = asdict(self)
        if exclude_none:
            return {k: v for k, v in data.items() if v is not None}
        return data


@dataclass
class Choice:
    index: int
    message: Message
    finish_reason: str


@dataclass
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class ChatResponse:
    id: str
    object: str = "chat.completion"
    created: int = 0
    model: str = ""
    choices: List[Choice] = field(default_factory=list)
    usage: Usage = field(default_factory=Usage)

    def model_dump(self):
        return asdict(self)


@dataclass
class ModelsResponse:
    data: List[Model]