#!/usr/bin/env node

/**
 * Luma Vision Skill — 识图脚本（独立版）
 *
 * 直接调用视觉模型 API，不依赖任何外部模块。
 * 支持三种图片来源：本地路径、HTTP(S) URL、Data URI。
 * 如果未指定路径或路径不存在，自动扫描常见缓存目录找最新图片。
 *
 * 用法:
 *   node <skill_dir>/scripts/vision.js <图片来源> <问题描述>
 *
 * 图片来源:
 *   - 本地路径:  ./image.png, D:\photos\photo.jpg
 *   - 远程 URL:  https://example.com/image.png
 *   - Data URI:  data:image/png;base64,...
 *   - 留空或 -: 自动查找缓存目录中最新图片
 *
 * 环境变量:
 *   CUSTOM_BASE_URL    - API 地址
 *   CUSTOM_MODEL_NAME  - 模型名称
 *   CUSTOM_API_KEY     - API Key
 *   INCLUDE_META       - true 时附加耗时 meta
 */

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { resolve, join, extname } from "path";
import { homedir, tmpdir } from "os";

const MIME_MAP = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

// 常见 AI 客户端缓存目录
const CACHE_DIRS = [
  join(homedir(), ".kimi-code", "cache"),          // Kimi Code
  join(homedir(), ".claude", "cache"),             // Claude Code
  join(homedir(), "AppData", "Local", "Temp"),     // Windows 临时目录
  tmpdir(),                                         // 系统临时目录
];

function parseArgs() {
  const args = process.argv.slice(2);
  let imageSource = "";
  let prompt = "请详细描述这张图片的内容。";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task-type") { i++; continue; }
    if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: node vision.js <image-source> [prompt]");
      console.log("  image-source: 本地路径 | URL | Data URI | - (自动查找)");
      process.exit(0);
    }
    if (!imageSource && !args[i].startsWith("--")) {
      imageSource = args[i];
    } else if (!args[i].startsWith("--")) {
      prompt = args[i];
    }
  }

  return { imageSource, prompt };
}

function isDataUri(input) {
  return typeof input === "string" && input.startsWith("data:") && /;base64,/.test(input);
}

function isUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** 扫描缓存目录，返回最新的一张图片路径 */
function findLatestCachedImage() {
  let latestFile = null;
  let latestTime = 0;

  for (const cacheDir of CACHE_DIRS) {
    if (!existsSync(cacheDir)) continue;
    try {
      const files = readdirSync(cacheDir);
      for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        const fullPath = join(cacheDir, file);
        const st = statSync(fullPath);
        if (!st.isFile()) continue;
        if (st.mtimeMs > latestTime) {
          latestTime = st.mtimeMs;
          latestFile = fullPath;
        }
      }
    } catch { /* 权限不足等跳过 */ }
  }

  return latestFile;
}

async function loadImage(source) {
  // 1. Data URI 直接解析
  if (isDataUri(source)) {
    const match = source.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) throw new Error("无效的 Data URI");
    return { mime: match[1].toLowerCase(), base64: match[2] };
  }

  // 2. 远程 URL
  if (isUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`远程图片拉取失败 (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const ext = source.toLowerCase().split(".").pop();
    const mime = contentType.split(";")[0] || MIME_MAP[ext] || "image/png";
    return { mime, base64: buffer.toString("base64") };
  }

  // 3. 本地路径
  let localPath = source.startsWith("@") ? source.slice(1) : source;
  const imagePath = resolve(localPath);
  if (existsSync(imagePath)) {
    const buffer = readFileSync(imagePath);
    const ext = imagePath.toLowerCase().split(".").pop();
    const mime = MIME_MAP[ext] || "image/png";
    return { mime, base64: buffer.toString("base64") };
  }

  // 4. 路径不存在或未指定 → 自动查找缓存目录
  if (!source || source === "-" || !existsSync(imagePath)) {
    const found = findLatestCachedImage();
    if (found) {
      const buffer = readFileSync(found);
      const ext = found.toLowerCase().split(".").pop();
      const mime = MIME_MAP[ext] || "image/png";
      return { mime, base64: buffer.toString("base64") };
    }
    throw new Error("找不到图片文件，请指定路径或确保已粘贴图片");
  }

  throw new Error(`图片文件不存在: ${imagePath}`);
}

async function main() {
  const { imageSource, prompt } = parseArgs();

  const apiKey = process.env.CUSTOM_API_KEY;
  const baseURL = process.env.CUSTOM_BASE_URL || "https://api.minimaxi.com/v1";
  const model = process.env.CUSTOM_MODEL_NAME || "MiniMax-M3";

  if (!apiKey) {
    console.error("错误: CUSTOM_API_KEY 未设置");
    process.exit(1);
  }

  const { mime, base64 } = await loadImage(imageSource);

  const started = Date.now();
  const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
    max_tokens: 2048,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown");
    console.error(`API 错误 (${response.status}): ${errText}`);
    process.exit(1);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("API 返回异常: 缺少 choices[0].message.content");
    process.exit(1);
  }

  const elapsed = Date.now() - started;

  if (process.env.INCLUDE_META === "true") {
    console.log(content + `\n\n---\nluma_meta:\n- model: ${model}\n- total_ms: ${elapsed}\n`);
  } else {
    console.log(content);
  }
}

main().catch((err) => {
  console.error(`错误: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});