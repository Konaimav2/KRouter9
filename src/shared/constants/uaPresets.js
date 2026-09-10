// KRouter9 custom-provider User-Agent presets — CLIENT-SAFE (no node imports).
// Values mirror open-sse/config/clientVersions.js. A unit test
// (tests/unit/node-ua-presets.test.js) fails if they drift.
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
