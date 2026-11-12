# mrouter - Personal Model Router

A Cloudflare Workers-based model router that automatically routes requests to available models across Ollama Cloud (free models only) and OpenRouter, with rate limiting and automatic failover.

## Features

- **Multi-provider support**: Ollama Cloud (free models) + OpenRouter (cost-filtered)
- **Rate limiting**: Per-provider request limiting
- **Automatic failover**: Retries across healthy providers
- **Cost control**: Blocks expensive models (GPT-4, Claude Opus, etc.)
- **Secure**: API keys stored as Cloudflare Workers secrets
- **Generic errors**: Never exposes provider errors to clients

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create KV namespace for caching:
```bash
npx wrangler kv:namespace create MODEL_CACHE
```

3. Add the KV namespace IDs to `wrangler.toml`

4. Set secrets (never commit these!):
```bash
npx wrangler secret put OLLAMA_CLOUD_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
```

5. Develop locally:
```bash
npm run dev
```

6. Deploy:
```bash
npm run deploy
```

## API Endpoints

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completion (OpenAI-compatible)
- `GET /health` - Health check
- `GET /stats` - Usage statistics

## Configuration

Edit `src/config.ts` to adjust:
- Blocked model patterns
- Rate limits
- Retry behavior
- Token budgets

## Security

- API keys are stored as **Cloudflare Workers secrets**, never in code
- Errors are sanitized to generic messages
- No sensitive data logged