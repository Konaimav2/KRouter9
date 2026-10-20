import crypto from "node:crypto";
import { DefaultExecutor } from "./default.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel, isOpencodeFreeTierModel } from "../providers/models/helpers.js";
import { appendMissingFingerprintTools } from "../utils/opencodeFingerprint.js";
import {
  normalizeResponsesInput,
  clampResponsesCallId,
  coerceResponsesArguments,
  coerceResponsesOutput,
} from "../translator/formats/responsesApi.js";

const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeZenSession";
const MAX_SESSION_LENGTH = 256;
const RESPONSES_BASE_URL = "https://opencode.ai/zen/v1/responses";
const MAX_TOOL_NAME_LEN = 128;
const OPENCODE_UA = "opencode/1.18.31";
export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;
const SESSION_TIME_MASK = (1n << 36n) - 1n;

function hasValidOpencodeVersion(ua) {
  const match = String(ua || "").match(/opencode\/(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) return false;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  return major > 1 || (major === 1 && minor >= 17);
}

function unstableRandom() {
  const bytes = crypto.randomBytes(14);
  return Array.from(bytes, (byte) => BASE62_CHARS[byte % 62]).join("");
}

// CLI encodes time and a small counter into the low 48 bits. A hash-derived
// counter can fail the upstream free-tier gate, so pin the counter to 1.
function descendingTimeHex(time) {
  return (~(BigInt(time) * 0x1000n + 1n) & SESSION_PREFIX_MASK).toString(16).padStart(12, "0");
}

export function generateSessionId(timestamp = Date.now()) {
  return `ses_${descendingTimeHex(timestamp)}${unstableRandom()}`;
}

export function generateRequestId(timestamp = Date.now()) {
  const value = (BigInt(timestamp) * 0x1000n + 1n) & SESSION_PREFIX_MASK;
  return `msg_${value.toString(16).padStart(12, "0")}${unstableRandom()}`;
}

export function translateSessionId(sessionId, clientTool = "") {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) return sessionId.trim();
  const digest = crypto.createHash("sha256")
    .update(`opencode\0${clientTool || "generic"}\0${sessionId || ""}`).digest();
  const time = BigInt(`0x${digest.subarray(0, 5).toString("hex")}`) & SESSION_TIME_MASK;
  const randomPart = Array.from(digest.subarray(6, 20), (byte) => BASE62_CHARS[byte % 62]).join("");
  return `ses_${descendingTimeHex(time)}${randomPart}`;
}

function normalizeSession(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_SESSION_LENGTH ? normalized : null;
}

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== SESSION_HEADER) continue;
    const normalized = normalizeSession(value);
    if (normalized && OPENCODE_SESSION_RE.test(normalized)) return normalized;
  }
  return null;
}

// Same native Responses sanitization as Go, with Zen's encrypted-history guard.
function normalizeResponsesTools(body) {
  if (!Array.isArray(body.tools)) return;
  const validNames = new Set();
  body.tools = body.tools.filter((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
    const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function) ? tool.function : null;
    const rawName = typeof tool.name === "string" ? tool.name : (typeof fn?.name === "string" ? fn.name : "");
    const name = rawName.trim();
    if (!name) return false;
    const description = typeof tool.description === "string" ? tool.description : (typeof fn?.description === "string" ? fn.description : "");
    let parameters = tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
      ? tool.parameters
      : (fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters) ? fn.parameters : { type: "object", properties: {} });
    if (parameters.type === "object" && !parameters.properties) parameters = { ...parameters, properties: {} };
    for (const key of Object.keys(tool)) delete tool[key];
    tool.type = "function";
    tool.name = name.slice(0, MAX_TOOL_NAME_LEN);
    if (description) tool.description = description;
    tool.parameters = parameters;
    validNames.add(tool.name);
    return true;
  });
  if (body.tool_choice && typeof body.tool_choice === "object" && !Array.isArray(body.tool_choice)
    && body.tool_choice.type === "function") {
    const name = typeof body.tool_choice.name === "string" ? body.tool_choice.name.trim() : "";
    if (!name || !validNames.has(name)) delete body.tool_choice;
  }
}

function sanitizeResponsesItems(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    // Contributor backends cannot validate prior reasoning across accounts.
    if (item.type === "reasoning") return false;
    delete item.encrypted_content;
    delete item.reasoning_encrypted_content;
    if (item.type === "function_call") {
      if (typeof item.name !== "string" || !item.name.trim()) return false;
      item.name = item.name.trim().slice(0, MAX_TOOL_NAME_LEN);
      item.call_id = clampResponsesCallId(item.call_id);
      item.arguments = coerceResponsesArguments(item.arguments);
    } else if (item.type === "function_call_output") {
      item.call_id = clampResponsesCallId(item.call_id);
      item.output = coerceResponsesOutput(item.output);
    }
    return true;
  });
}

export class OpenCodeZenExecutor extends DefaultExecutor {
  constructor() {
    super("opencode-zen");
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    if (isMuseSparkModel(model)) return RESPONSES_BASE_URL;
    return super.buildUrl(model, stream, urlIndex, credentials);
  }

  prepareRequestCredentials({ body, credentials, providerSessionId, clientTool } = {}) {
    const sourceCredentials = credentials || {};
    const native = nativeSession(sourceCredentials.rawHeaders);
    const resolved = normalizeSession(providerSessionId) || resolveSessionId({
      headers: sourceCredentials.rawHeaders,
      body,
      connectionId: sourceCredentials.connectionId,
      scope: "opencode-zen",
    });
    return { ...sourceCredentials, [SESSION_FIELD]: native || translateSessionId(resolved, clientTool) };
  }

  async execute(args) {
    return super.execute({ ...args, credentials: this.prepareRequestCredentials(args) });
  }

  buildHeaders(credentials, stream = true, url, model) {
    const headers = super.buildHeaders(credentials || {}, stream, url, model);
    const lower = {};
    for (const [key, value] of Object.entries(credentials?.rawHeaders || {})) lower[key.toLowerCase()] = value;
    const ua = lower["user-agent"] || "";
    headers["User-Agent"] = hasValidOpencodeVersion(ua) ? ua : OPENCODE_UA;
    headers["x-opencode-client"] = lower["x-opencode-client"] || "desktop";
    headers["x-opencode-project"] = lower["x-opencode-project"] || "global";
    headers[SESSION_HEADER] = credentials?.[SESSION_FIELD] || this.prepareRequestCredentials({ credentials })[SESSION_FIELD];
    if (isOpencodeFreeTierModel(model)) {
      headers.Authorization = "Bearer public";
      headers["x-opencode-request"] = generateRequestId();
    }
    return headers;
  }

  transformRequest(model, body) {
    const out = super.transformRequest(model, body);
    if (!out || typeof out !== "object") return out;
    out.stream = true;
    const responses = isMuseSparkModel(model || body?.model);
    out.tools = appendMissingFingerprintTools(out.tools, responses);
    if (!responses) return out;
    const normalized = normalizeResponsesInput(out.input);
    if (normalized) out.input = normalized;
    if (!Array.isArray(out.input) || out.input.length === 0) {
      out.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }
    if (out.max_output_tokens === undefined) {
      if (out.max_completion_tokens !== undefined) out.max_output_tokens = out.max_completion_tokens;
      else if (out.max_tokens !== undefined) out.max_output_tokens = out.max_tokens;
    }
    delete out.max_tokens;
    delete out.max_completion_tokens;
    if (out.reasoning_effort !== undefined && out.reasoning === undefined) {
      out.reasoning = { effort: out.reasoning_effort, summary: "auto" };
    }
    if (out.reasoning && typeof out.reasoning === "object" && !Array.isArray(out.reasoning) && !out.reasoning.summary) {
      out.reasoning.summary = "auto";
    }
    delete out.reasoning_effort;
    out.store = false;
    normalizeResponsesTools(out);
    sanitizeResponsesItems(out);
    return out;
  }
}
