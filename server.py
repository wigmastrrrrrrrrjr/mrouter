import asyncio
import json
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from typing import Dict, Any

from dotenv import load_dotenv

from config import GENERIC_ERROR_MESSAGE
from router import ModelRouter
from models import ChatRequest

load_dotenv()

router = ModelRouter(
    os.getenv("OLLAMA_CLOUD_API_KEY", ""),
    os.getenv("OPENROUTER_API_KEY", "")
)

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)


def _start_loop():
    asyncio.set_event_loop(loop)
    loop.run_forever()


threading.Thread(target=_start_loop, daemon=True).start()


class RouterHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def send_json(self, data: Dict[str, Any], status: int = 200):
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == "/v1/models":
            future = asyncio.run_coroutine_threadsafe(router.get_available_models(), loop)
            try:
                models = future.result(timeout=30)
                self.send_json({"object": "list", "data": [m.model_dump() for m in models]})
            except Exception:
                self.send_json({"error": GENERIC_ERROR_MESSAGE})
        elif parsed.path == "/health":
            self.send_json({"status": "ok"})
        elif parsed.path == "/stats":
            self.send_json(router.get_usage_stats())
        else:
            self.send_json({"error": GENERIC_ERROR_MESSAGE}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        
        if parsed.path == "/v1/chat/completions":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode())
                req = ChatRequest(**data)
                future = asyncio.run_coroutine_threadsafe(router.chat(req), loop)
                response = future.result(timeout=60)
                self.send_json(response.model_dump())
            except Exception:
                self.send_json({"error": GENERIC_ERROR_MESSAGE})
        else:
            self.send_json({"error": GENERIC_ERROR_MESSAGE}, 404)

    def log_message(self, format, *args):
        pass


def run_server():
    server = HTTPServer(("0.0.0.0", 8080), RouterHandler)
    print("mrouter starting on 0.0.0.0:8080")
    server.serve_forever()


if __name__ == "__main__":
    run_server()