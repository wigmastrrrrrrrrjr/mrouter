import { ModelRouter } from "./router";
import { GENERIC_ERROR_MESSAGE } from "./config";
import { registerUser, loginUser, authenticate } from "./auth";
import type { ChatRequest } from "./types";

export interface Env {
  OLLAMA_CLOUD_API_KEY: string;
  OPENROUTER_API_KEY: string;
  MCODE_KV: KVNamespace;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function handleOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function errorResponse(message: string = GENERIC_ERROR_MESSAGE, status = 200): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    const router = new ModelRouter(env);
    const url = new URL(request.url);
    const kv = env.MCODE_KV;

    try {
      if (url.pathname === "/v1/auth/register" && request.method === "POST") {
        const { email, password } = (await request.json()) as { email: string; password: string };
        const result = await registerUser(kv, email, password);
        return result.ok ? jsonResponse({ ok: true }) : errorResponse(result.error, 400);
      }

      if (url.pathname === "/v1/auth/login" && request.method === "POST") {
        const { email, password } = (await request.json()) as { email: string; password: string };
        const result = await loginUser(kv, email, password);
        return result.ok
          ? jsonResponse({ ok: true, api_key: result.apiKey })
          : errorResponse(result.error, 401);
      }

      if (url.pathname === "/v1/auth/me" && request.method === "GET") {
        const email = await authenticate(kv, request.headers.get("Authorization"));
        if (!email) return errorResponse("Unauthorized. Send your key as 'Authorization: Bearer <key>'", 401);
        return jsonResponse({ email });
      }

      const email = await authenticate(kv, request.headers.get("Authorization"));

      if (url.pathname === "/v1/models" && request.method === "GET") {
        if (!email) return errorResponse("Unauthorized. Send your key as 'Authorization: Bearer <key>'", 401);
        const models = await router.getAvailableModels();
        return jsonResponse({ object: "list", data: models });
      }

      if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
        if (!email) return errorResponse("Unauthorized. Send your key as 'Authorization: Bearer <key>'", 401);
        const body = (await request.json()) as ChatRequest;
        const response = await router.chat(body);
        return jsonResponse(response);
      }

      if (url.pathname === "/health" && request.method === "GET") {
        return jsonResponse({ status: "ok" });
      }

      if (url.pathname === "/stats" && request.method === "GET") {
        return jsonResponse(router.getUsageStats());
      }

      return errorResponse("Not found", 404);
    } catch (error) {
      console.error("mrouter error:", error);
      return errorResponse();
    }
  },
} satisfies ExportedHandler<Env>;
