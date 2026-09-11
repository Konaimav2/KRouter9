// KRouter9 custom-provider User-Agent presets — CLIENT-SAFE (no node imports).
// Values mirror open-sse/config/clientVersions.js. A unit test
// (tests/unit/node-ua-presets.test.js) fails if they drift.
import { APP_CONFIG } from "./config.js";

export const UA_PRESET_OPTIONS = [
  { value: "default", label: "Default (no override)" },
  { value: "claude_code", label: "Claude Code", ua: "claude-cli/2.1.258 (external, sdk-cli)" },
  { value: "codex_cli_rs", label: "OpenAI Codex CLI", ua: "codex_cli_rs/0.149.1" },
  { value: "copilot", label: "GitHub Copilot Chat", ua: "GitHubCopilotChat/0.63.0" },
  { value: "antigravity", label: "Antigravity IDE", ua: "antigravity/ide/2.11.0 darwin/arm64" },
  { value: "gemini_cli", label: "Gemini CLI", ua: "google-genai-sdk/1.30.0 gl-node/v22.19.0" },
  { value: "kiro", label: "Kiro IDE", ua: "AWS-SDK-JS/3.0.0 kiro-ide/1.0.337" },
  { value: "trae", label: "Trae", ua: "Trae/1.0.0 antigravity-cockpit-tools" },
  { value: "codebuddy_cn", label: "CodeBuddy CN", ua: "CLI/2.138.0 CodeBuddy/2.138.0" },
  { value: "codebuddy_intl", label: "CodeBuddy Intl", ua: "IDE/2.138.0 CodeBuddy/2.138.0" },
  { value: "grok_cli", label: "Grok CLI", ua: "grok-pager/1.0.5 grok-shell/1.0.5 (linux; x86_64)" },
  { value: "kimchi", label: "Kimchi", ua: "kimchi/1.0.3" },
  { value: "zed", label: "Zed", ua: "zenrouter/zed" },
  { value: "iflow", label: "iFlow CLI", ua: "iFlow-Cli" },
  { value: "custom", label: "Custom..." },
];

const UA_BY_VALUE = Object.fromEntries(UA_PRESET_OPTIONS.filter((o) => o.ua).map((o) => [o.value, o.ua]));

// Resolve (preset, customText) → stored userAgent string ("" = no override).
export function resolveNodeUserAgent(preset, customText) {
  if (!preset || preset === "default") return "";
  if (preset === "custom") return String(customText || "").trim();
  if (preset === "krouter9") return `krouter9/${APP_CONFIG.version || ""}`.replace(/\/$/, "");
  if (preset === "opencode") return "opencode/1.18.30";
  if (preset === "browser") {
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
  }
  return UA_BY_VALUE[preset] || "";
}

// Reverse: stored UA string → { preset, custom } for editing.
export function presetForUserAgent(ua) {
  const t = String(ua || "").trim();
  if (!t) return { preset: "default", custom: "" };
  const hit = UA_PRESET_OPTIONS.find((o) => o.ua === t);
  if (hit) return { preset: hit.value, custom: "" };
  return { preset: "custom", custom: t };
}

// ─────────────────────────────────────────────────────────────────────────
// Node-level UA selector: the curated 5-choice list for Add/Edit Compatible
// Provider modals. "9router" is the default and sends the krouter9/<version>
// gateway string. Connection-level modals keep the full list above.
// ─────────────────────────────────────────────────────────────────────────
export const NODE_UA_PRESET_OPTIONS = [
  { value: "krouter9", label: "9Router (default)" },
  { value: "opencode", label: "OpenCode" },
  { value: "claude_code", label: "Claude Code", ua: UA_BY_VALUE.claude_code },
  { value: "browser", label: "Browser" },
  { value: "custom", label: "Custom..." },
];

export function resolveNodeUserAgentPreset(preset, customText) {
  return resolveNodeUserAgent(preset, customText);
}

export function presetForNodeUserAgent(ua) {
  const t = String(ua || "").trim();
  if (!t) return { preset: "krouter9", custom: "" };
  if (t.startsWith("krouter9/") || t === "krouter9") return { preset: "krouter9", custom: "" };
  if (t.startsWith("opencode/")) return { preset: "opencode", custom: "" };
  if (t === UA_BY_VALUE.claude_code) return { preset: "claude_code", custom: "" };
  if (t.startsWith("Mozilla/")) return { preset: "browser", custom: "" };
  return { preset: "custom", custom: t };
}
