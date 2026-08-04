/**
 * MCP HTTP（streamable HTTP）集成测试
 * 启动真实 server（src/index.ts 的 createServer），验证传输链路、会话管理与鉴权。
 * 不调用真实视觉 API（tools/list 无需 API key）。
 *
 * 运行: npx tsx test/test-mcp-http.ts
 */

import { once } from "events";
import { randomUUID } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { createHttpServer } from "../src/http-server.js";
import { createServer as createMcpServer } from "../src/index.js";

const TOKEN = "test-token-" + randomUUID();
const ACCEPT = "application/json, text/event-stream";
const BASE_HEADERS = {
  "Content-Type": "application/json",
  Accept: ACCEPT,
  Authorization: `Bearer ${TOKEN}`,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERT FAILED: ${message}`);
  }
}

/** SDK 对 POST 可能返回 JSON 或 SSE 流，统一解析为 JSON */
async function parseMcpBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice(6));
    const last = dataLines[dataLines.length - 1];
    if (!last) {
      throw new Error(`empty SSE body: ${JSON.stringify(text)}`);
    }
    return JSON.parse(last);
  }
  return JSON.parse(text);
}

async function main() {
  // 测试进程与用户环境隔离：强制非 custom provider（缺 key 会直接抛错）
  process.env.MODEL_PROVIDER = "zhipu";

  const mcpServer = await createMcpServer();
  const httpServer: Server = createHttpServer(mcpServer, {
    version: "test",
    token: TOKEN,
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const { port } = httpServer.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  // 1. 健康检查
  const healthRes = await fetch(`${base}/`);
  assert(healthRes.status === 200, `health status ${healthRes.status}`);
  const health = (await healthRes.json()) as {
    name?: string;
    version?: string;
  };  assert(health.name === "luma-mcp", "health name");
  assert(typeof health.version === "string", "health version");

  // 2. 无 token / 错误 token → 401
  const noAuthRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: ACCEPT },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }),
  });
  assert(noAuthRes.status === 401, `no-auth status ${noAuthRes.status}`);
  const badAuthRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { ...BASE_HEADERS, Authorization: "Bearer wrong" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }),
  });
  assert(badAuthRes.status === 401, `bad-auth status ${badAuthRes.status}`);

  // 2.1 无效 JSON body → 400
  const badJsonRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: "not-json{{",
  });
  assert(badJsonRes.status === 400, `bad-json status ${badJsonRes.status}`);

  // 3. 初始化 → 返回 mcp-session-id
  const initRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "luma-http-test", version: "1.0.0" },
      },
    }),
  });
  assert(initRes.status === 200, `init status ${initRes.status}`);
  const sessionId = initRes.headers.get("mcp-session-id");
  assert(sessionId, "mcp-session-id header missing");
  const initBody = (await parseMcpBody(initRes)) as {
    result?: { serverInfo?: { name?: string } };
  };
  assert(initBody.result?.serverInfo?.name === "luma-mcp", "serverInfo.name");

  // 4. 带会话 tools/list → 含 image_understand
  const toolsRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { ...BASE_HEADERS, "MCP-Session-Id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  assert(toolsRes.status === 200, `tools/list status ${toolsRes.status}`);
  const toolsBody = (await parseMcpBody(toolsRes)) as {
    result?: { tools?: Array<{ name: string }> };
  };
  const names = (toolsBody.result?.tools || []).map((t) => t.name);
  assert(names.includes("image_understand"), `image_understand missing: ${names.join(", ")}`);

  // 5. 无效会话 → 404
  const badSessionRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { ...BASE_HEADERS, "MCP-Session-Id": "no-such-session" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    }),
  });
  assert(badSessionRes.status === 404, `bad-session status ${badSessionRes.status}`);

  // 6. CORS preflight
  const preflightRes = await fetch(`${base}/mcp`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, mcp-session-id",
    },
  });
  assert(preflightRes.status === 204, `preflight status ${preflightRes.status}`);
  assert(
    preflightRes.headers.get("access-control-allow-origin") === "*",
    "CORS allow-origin"
  );

  // 7. DELETE 关闭会话 → 之后请求 404
  const delRes = await fetch(`${base}/mcp`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${TOKEN}`, "MCP-Session-Id": sessionId },
  });
  assert(delRes.status === 200, `delete status ${delRes.status}`);
  const afterDelRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { ...BASE_HEADERS, "MCP-Session-Id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
      params: {},
    }),
  });
  assert(afterDelRes.status === 404, `after-delete status ${afterDelRes.status}`);

  // 8. 会话 TTL 清理（TTL=0 + 100ms 扫描间隔 → 会话立即过期）
  const ttlServer = createHttpServer(mcpServer, {
    version: "test",
    token: TOKEN,
    sessionTtlMs: 0,
    cleanupIntervalMs: 100,
  });
  ttlServer.listen(0, "127.0.0.1");
  await once(ttlServer, "listening");
  const { port: ttlPort } = ttlServer.address() as AddressInfo;
  const ttlBase = `http://127.0.0.1:${ttlPort}`;
  const ttlInit = await fetch(`${ttlBase}/mcp`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "luma-http-test", version: "1.0.0" },
      },
    }),
  });
  const ttlSession = ttlInit.headers.get("mcp-session-id");
  assert(ttlSession, "ttl session missing");
  await new Promise((r) => setTimeout(r, 400)); // 等清理扫描跑过
  const ttlAfter = await fetch(`${ttlBase}/mcp`, {
    method: "POST",
    headers: { ...BASE_HEADERS, "MCP-Session-Id": ttlSession },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  assert(ttlAfter.status === 404, `ttl cleanup status ${ttlAfter.status} (expected 404)`);
  ttlServer.close();

  console.log("=== MCP HTTP smoke test passed ===");
  httpServer.closeAllConnections();
  httpServer.close();
  process.exit(0);
}

main().catch((err) => {
  // console 已被 index.ts 重定向到日志（Error 序列化会丢消息），直接用 stderr 输出
  const message = err instanceof Error ? `${err.message}\n${err.stack || ""}` : String(err);
  process.stderr.write(`MCP HTTP test failed: ${message}\n`);
  process.exit(1);
});
