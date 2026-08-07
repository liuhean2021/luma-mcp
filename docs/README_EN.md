# Luma MCP

Multi-model vision MCP server for AI assistants that do not have native image understanding.

English | [中文](../README.md)

## Features

- **Multi-model support**: GLM-4.6V, DeepSeek-OCR, Qwen3-VL-Flash, Doubao-Seed-1.6, and Hunyuan-Vision
- **Single-tool surface**: everything goes through `image_understand`, backward compatible
- **Better handling for difficult screenshots**: multi-crop for large images and detail-preserving processing for text-heavy inputs
- **Unified preprocessing pipeline** for local files, remote URLs, and Data URIs
- **Works well for** code screenshots, UI screenshots, error screens, documents, and OCR
- **Standard MCP integration** for Claude Desktop, Cline, Claude Code, and similar clients
- **HTTP / Docker deployment** to share a single instance across LAN clients (v1.7.0+)
- **Built-in retry** for transient request failures

## Quick Start

### Requirements

- Node.js >= 18
- One provider API key

### Install

Run directly via `npx` (no local install needed):

```bash
npx -y luma-mcp
```

Or build from source:

```bash
git clone https://github.com/JochenYang/luma-mcp.git
cd luma-mcp
npm install
npm run build
```

## Not Using MCP? Try the Luma Vision Skill (lightweight alternative)

Don't want to install an MCP server, or your AI client (e.g. Kimi Code) supports skills but not MCP? Use the `vision-skill/` directory in this repo directly:

- **Install**: copy the `vision-skill/` directory into your agent's skills directory (e.g. `~/.agents/skills/vision-skill`)
- **Activate**: start your message with `/skill luma-vision` together with an image; the skill runs `scripts/vision.js` which calls the vision model API directly
- **Configure**: set these system environment variables (shared with the MCP `custom` provider):

| Variable | Description |
| -------- | ----------- |
| `CUSTOM_BASE_URL` | OpenAI-compatible API URL (default `https://api.minimaxi.com/v1`) |
| `CUSTOM_MODEL_NAME` | Model name (default `MiniMax-M3`) |
| `CUSTOM_API_KEY` | API key |

**Differences from the MCP version**: the skill is a zero-dependency script for single-image calls — it supports local paths, HTTP(S) URLs, and Data URIs, and auto-scans common cache directories for the latest image when the source is omitted; it does not include multi-crop, compression, retry, or SSRF protection.

## Configuration

### Basic setup (npx)

Register in your MCP client's `mcpServers` (works for Claude Desktop, Cline / VSCode):

```json
{
  "mcpServers": {
    "luma": {
      "command": "npx",
      "args": ["-y", "luma-mcp"],
      "env": {
        "MODEL_PROVIDER": "zhipu",
        "ZHIPU_API_KEY": "your-api-key"
      }
    }
  }
}
```

Replace `MODEL_PROVIDER` and the matching key with the provider you want:

| `MODEL_PROVIDER` | API key env var |
| ---------------- | --------------- |
| `zhipu` | `ZHIPU_API_KEY` |
| `siliconflow` | `SILICONFLOW_API_KEY` |
| `qwen` | `DASHSCOPE_API_KEY` |
| `volcengine` | `VOLCENGINE_API_KEY` |
| `hunyuan` | `HUNYUAN_API_KEY` |
| `custom` | `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` + `CUSTOM_MODEL_NAME` |

Default models are listed in the [Provider Keys](#provider-keys) table. To override the model, add the `MODEL_NAME` env var, e.g.:

- `MODEL_NAME=doubao-seed-1-6-vision-250815` (Volcengine deep-thinking vision model)
- `MODEL_NAME=hy-vision-2.0-instruct` (Hunyuan, Tencent Cloud TokenHub)

> [!NOTE]
> **Hunyuan models migrated**: the old Tencent Hunyuan platform vision models (`hunyuan-t1-vision-20250916`, `Tencent HY Vision 1.5 Instruct`, etc.) were retired on 2026-06-22; the new models (HY-Vision 2.0, etc.) live on [Tencent Cloud TokenHub](https://cloud.tencent.com/product/tokenhub). The `hunyuan` provider in luma still defaults to the old endpoint; to use TokenHub models, connect via the `custom` provider with `CUSTOM_BASE_URL=https://tokenhub.tencentmaas.com/v1`.

### Claude Code quick commands

```bash
# Zhipu
claude mcp add -s user luma-mcp --env MODEL_PROVIDER=zhipu --env ZHIPU_API_KEY=your-api-key -- npx -y luma-mcp

# SiliconFlow
claude mcp add -s user luma-mcp --env MODEL_PROVIDER=siliconflow --env SILICONFLOW_API_KEY=your-api-key -- npx -y luma-mcp

# Qwen
claude mcp add -s user luma-mcp --env MODEL_PROVIDER=qwen --env DASHSCOPE_API_KEY=your-api-key -- npx -y luma-mcp

# Volcengine
claude mcp add -s user luma-mcp --env MODEL_PROVIDER=volcengine --env VOLCENGINE_API_KEY=your-api-key --env MODEL_NAME=doubao-seed-1-6-vision-250815 -- npx -y luma-mcp

# Hunyuan (new models on Tencent Cloud TokenHub; old platform models retired)
claude mcp add -s user luma-mcp --env MODEL_PROVIDER=hunyuan --env HUNYUAN_API_KEY=your-api-key --env MODEL_NAME=hy-vision-2.0-instruct -- npx -y luma-mcp
```

### Local development mode

Point to the local `build/index.js` (replace `<project-path>` with your absolute project path):

```json
{
  "mcpServers": {
    "luma": {
      "command": "node",
      "args": ["<project-path>/build/index.js"],
      "env": {
        "MODEL_PROVIDER": "zhipu",
        "ZHIPU_API_KEY": "your-api-key"
      }
    }
  }
}
```

If your MCP client supports a working directory, you can also use the relative path `build/index.js` with cwd set to the project root.

### HTTP / Docker deployment (LAN sharing, v1.7.0+)

The default transport is stdio (local process). To share one instance across multiple clients on your LAN, switch to **Streamable HTTP**:

```bash
# Run locally over HTTP
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_HTTP_TOKEN=your-token node build/index.js
```

Docker:

```bash
docker build -t luma-mcp .
docker run -d --name luma-mcp -p 3000:3000 \
  -e MODEL_PROVIDER=zhipu \
  -e ZHIPU_API_KEY=your-api-key \
  -e MCP_HTTP_TOKEN=your-token \
  luma-mcp
```

Client config (Claude Desktop / Cline and other clients that support URL-based servers):

```json
{
  "mcpServers": {
    "luma": {
      "type": "http",
      "url": "http://<server-ip>:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

> [!IMPORTANT]
> **Always set `MCP_HTTP_TOKEN`**: in HTTP mode anyone who can reach the port can call `image_understand` and consume your model API quota.
>
> **Image source limits**: in HTTP mode `image_source` only supports HTTP(S) URLs and Data URIs; **local file paths do not work** (the server runs remotely and cannot read client files). Data URI images are limited to ~10MB (request body cap is 30MB).

### Custom Provider (v1.5.0+)

Use any OpenAI-compatible endpoint (OpenAI, OpenRouter, Together AI, Anthropic proxy, local vLLM/Ollama, etc.):

```bash
claude mcp add -s user luma-mcp \
  --env MODEL_PROVIDER=custom \
  --env CUSTOM_API_KEY=sk-your-key \
  --env CUSTOM_BASE_URL=https://your-endpoint.com/v1 \
  --env CUSTOM_MODEL_NAME=your-model \
  -- npx -y luma-mcp
```

Optional config (all have defaults):

- `CUSTOM_AUTH_HEADER=bearer` — `bearer` / `x-api-key` / `custom`
- `CUSTOM_PATH=/chat/completions` — API path
- `CUSTOM_TIMEOUT_MS=60000` — timeout in ms
- `CUSTOM_THINKING_MODE=disabled` — `disabled` / `openai` / `qwen_extra_body`
- `CUSTOM_AUTH_HEADER_VALUE="X-API-Key: {{key}}"` — custom header template (`{{key}}` is replaced with the API key)

## Usage

### `image_understand`

**Single tool** with these parameters:

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `image_source` | Yes | Pasted path, local file path, HTTP(S) image URL, or Data URI |
| `prompt` | Yes | The user's original question about the image; no long template needed |
| `task_type` | No | `auto` \| `general` \| `ocr` \| `ui` \| `debug` \| `describe` |

`task_type` behavior:

- Omitted or `auto` (default): matches pre-1.6 behavior, routed heuristically by prompt
- `ocr`: text extraction, single high-fidelity image by default (multi-crop disabled)
- `ui` / `debug`: UI structure / error screenshot, prefers text fidelity
- `describe`: concise description

Example:

```typescript
image_understand({
  image_source: "./screenshot.png",
  prompt: "Analyze the layout and main component structure of this page",
  task_type: "ui",
});

image_understand({
  image_source: "./code-error.png",
  prompt: "Why is this code failing? Suggest a fix",
  // task_type can be omitted; behavior matches pre-1.6
});

image_understand({
  image_source: "https://example.com/ui.png",
  prompt: "Find usability issues in this interface",
});
```

### Notes

- Non-vision models usually need an explicit instruction to call the MCP tool
- Text-heavy screenshots such as OCR images, code, tables, and long documents use a more detail-preserving preprocessing path
- Large images are expanded into an original image plus ordered crops before being sent to the model
- For timing/tile-count debugging, set `INCLUDE_META=true` or `LUMA_DEBUG=1` to append `luma_meta` to the result

## Environment Variables

### General

| Variable | Default | Description |
| --- | --- | --- |
| `MODEL_PROVIDER` | `zhipu` | Provider: `zhipu`, `siliconflow`, `qwen`, `volcengine`, `hunyuan`, `custom` |
| `MODEL_NAME` | auto-selected | Model name override |
| `MAX_TOKENS` | `8192` | Max generated tokens (some models have hard caps, see below) |
| `TEMPERATURE` | `0.7` | Sampling temperature |
| `TOP_P` | `0.95` | Nucleus sampling threshold |
| `ENABLE_THINKING` | `true` | Thinking mode; set `false` to disable |
| `MULTI_CROP` | `true` | Multi-crop for large images; set `false` to disable |
| `MULTI_CROP_MAX_TILES` | `5` | Max tiles including the original image (1–16) |
| `BASE_VISION_PROMPT` | built-in default | Override the base vision prompt (empty string disables it) |
| `INCLUDE_META` | `false` | Append preprocess/API timing metadata to tool results when `true` |
| `LUMA_DEBUG` | off | `1`/`true` is equivalent to enabling `INCLUDE_META` |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio` (default) or `http` (Streamable HTTP) |
| `MCP_HTTP_HOST` | `0.0.0.0` | HTTP mode listen address (must be `0.0.0.0` inside Docker) |
| `MCP_HTTP_PORT` | `3000` | HTTP mode listen port |
| `MCP_HTTP_TOKEN` | empty (no auth) | HTTP mode Bearer token; **required for LAN sharing** |

> [!IMPORTANT]
> **Special Note on Token Limits:**
> 1. **SiliconFlow (DeepSeek-OCR)**: This model has a total context length (input + output) of only **8192**. To ensure images can be processed, Luma enforces a hard limit of **4096** for `MAX_TOKENS` internally for this provider. Any higher value in environment variables will be truncated.
> 2. **General Recommendation**: Vision understanding tasks rarely require extremely long outputs. It is recommended to keep `MAX_TOKENS` at `4096` or `8192`. Setting it to `16384` may lead to `400` errors when processing large images if the total length exceeds the model's capacity.

### Provider Keys

| Provider | Required env var | Default model |
| --- | --- | --- |
| Zhipu | `ZHIPU_API_KEY` | `glm-4.6v` |
| SiliconFlow | `SILICONFLOW_API_KEY` | `deepseek-ai/DeepSeek-OCR` |
| Qwen | `DASHSCOPE_API_KEY` | `qwen3-vl-flash` |
| Volcengine | `VOLCENGINE_API_KEY` | `doubao-seed-1-6-flash-250828` |
| Hunyuan | `HUNYUAN_API_KEY` | `hunyuan-t1-vision-20250916` |

## Image Limits and Processing

- Supported formats: JPG, PNG, WebP, GIF
- Maximum input size: 10MB (same for local files, remote URLs, and Data URIs)
- Images larger than 2MB are compressed automatically
- Maximum resolution: 16 megapixels (exceeding it returns an error)
- Remote URLs are fetched into the same preprocessing pipeline and carry SSRF protection (private/internal addresses rejected, redirects disabled)
- Images with a long side ≥ 1800px or ≥ 3.5M pixels are expanded into an original image plus ordered crops (controlled by `MULTI_CROP` / `MULTI_CROP_MAX_TILES`)

## Local Testing

```bash
# Unit tests (no real API calls)
npm run test:unit

# MCP stdio end-to-end test (real image_understand call)
npm run test:mcp

# MCP HTTP transport test (no API key required)
npm run test:http

# Basic test
npm run test:local ./test.png

# Test with a question
npm run test:local ./code-error.png "What's wrong with this code?"

# Remote image test
npm run test:local https://example.com/image.jpg

# Check source and test types
npm run typecheck
```

## Model Selection

- OCR and text extraction: DeepSeek-OCR
- Fast low-cost general analysis: Qwen3-VL-Flash
- Cost-effective general analysis: Doubao-Seed-1.6
- Deep image understanding: GLM-4.6V
- Complex multimodal reasoning and multilingual tasks: Hunyuan-Vision (new models are Hunyuan HY-Vision on Tencent Cloud TokenHub)

## Project Structure

```text
luma-mcp/
├── src/
│   ├── index.ts                      # MCP server entry, registers image_understand
│   ├── http-server.ts                # Streamable HTTP transport (auth/session/CORS)
│   ├── config.ts                     # Env var loading and validation
│   ├── constants.ts                  # Default vision prompt and shared constants
│   ├── task-types.ts                 # Optional task_type routing
│   ├── vision-client.ts              # Shared vision client interface
│   ├── openai-compatible-client.ts   # OpenAI-compatible request base class
│   ├── zhipu-client.ts               # GLM-4.6V client
│   ├── siliconflow-client.ts         # DeepSeek-OCR client
│   ├── qwen-client.ts                # Qwen3-VL client
│   ├── volcengine-client.ts          # Doubao-Seed-1.6 client
│   ├── hunyuan-client.ts             # Hunyuan-Vision client
│   ├── custom-client.ts              # Any OpenAI-compatible endpoint
│   ├── image-processor.ts            # Image preprocessing, compression, tiling
│   └── utils/
│       ├── helpers.ts                # Retry, response formatting, error sanitization
│       └── logger.ts                 # Logging
├── test/
│   ├── test-local.ts                 # Local single/multi-image tests
│   ├── test-qwen.ts                  # Qwen client tests
│   ├── test-deepseek-raw.ts          # DeepSeek-OCR raw call tests
│   ├── test-data-uri.ts              # Data URI processing tests
│   ├── test-custom.ts                # CustomClient unit tests
│   ├── test-task-types.ts            # task_type routing tests
│   ├── test-mcp-stdio.ts             # MCP stdio end-to-end test
│   ├── test-mcp-http.ts              # MCP HTTP transport test (no API key)
│   └── image-processor-regression.ts # Image processing regression tests
├── Dockerfile                        # Containerized deployment for HTTP mode
├── vision-skill/                     # Lightweight vision skill (no-MCP alternative)
│   ├── SKILL.md                      # Skill definition: activated via /skill luma-vision
│   └── scripts/vision.js             # Zero-dependency script calling the vision model API
├── docs/
│   └── README_EN.md
├── build/                            # Compiled output
├── package.json
└── tsconfig.json
```

## Development

```bash
npm run watch
npm run build
npm run typecheck
```

## Links

- [Zhipu Open Platform](https://open.bigmodel.cn/)
- [SiliconFlow](https://cloud.siliconflow.cn/)
- [Aliyun Bailian](https://bailian.console.aliyun.com/)
- [Volcengine Ark](https://console.volcengine.com/ark)
- [Tencent Hunyuan](https://cloud.tencent.com/product/hunyuan)
- [MCP Protocol](https://modelcontextprotocol.io/)

## Changelog

[CHANGELOG.md](../CHANGELOG.md)

## License

MIT
