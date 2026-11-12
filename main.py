import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from config import GENERIC_ERROR_MESSAGE
from router import ModelRouter
from models import ChatRequest, Model

load_dotenv()

router: ModelRouter = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global router
    ollama_key = os.getenv("OLLAMA_CLOUD_API_KEY", "")
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
    router = ModelRouter(ollama_key, openrouter_key)
    yield


app = FastAPI(title="mrouter", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=200,
        content={"error": GENERIC_ERROR_MESSAGE},
    )


@app.get("/v1/models")
async def list_models():
    models = await router.get_available_models()
    return {"object": "list", "data": [m.model_dump() for m in models]}


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    try:
        response = await router.chat(req)
        return response.model_dump()
    except Exception:
        raise


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/stats")
async def stats():
    return router.get_usage_stats()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)