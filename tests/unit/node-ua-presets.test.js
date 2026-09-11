// Custom provider UA presets — preset list + resolve helper + drift guard
// against open-sse/config/clientVersions.js (single source of truth).
import { describe, it, expect } from "vitest";
import { UA_PRESET_OPTIONS, resolveNodeUserAgent, presetForUserAgent, NODE_UA_PRESET_OPTIONS, resolveNodeUserAgentPreset, presetForNodeUserAgent } from "../../src/lib/nodeUserAgent.js";
import {
  CLAUDE_CLI_USER_AGENT,
  CODEX_USER_AGENT,
  COPILOT_USER_AGENT,
  ANTIGRAVITY_IDE_VERSION,
  GEMINI_CLI_API_CLIENT,
  KIRO_USER_AGENT,
  TRAE_USER_AGENT,
  CODEBUDDY_CN_TRANSPORT_UA,
  CODEBUDDY_INTL_TRANSPORT_UA,
  GROK_CLI_USER_AGENT,
  KIMCHI_USER_AGENT,
  ZED_USER_AGENT,
  IFLOW_USER_AGENT,
  OPENCODE_USER_AGENT,
  BROWSER_USER_AGENT,
} from "../../open-sse/config/clientVersions.js";

describe("node UA presets", () => {
  it("exposes presets incl default + custom sentinels", () => {
    const vals = UA_PRESET_OPTIONS.map((o) => o.value);
    expect(vals).toContain("default");
    expect(vals).toContain("custom");
    expect(vals.length).toBeGreaterThan(5);
  });
  it("default preset resolves to empty (no override)", () => {
    expect(resolveNodeUserAgent("default", "")).toBe("");
  });
  it("codex preset resolves to codex UA", () => {
    const ua = resolveNodeUserAgent("codex_cli_rs", "");
    expect(ua).toMatch(/^codex_cli_rs\//);
  });
  it("custom preset uses the custom string", () => {
    expect(resolveNodeUserAgent("custom", "myapp/1.0")).toBe("myapp/1.0");
  });
  it("round-trips stored UA back to preset", () => {
    expect(presetForUserAgent("").preset).toBe("default");
    expect(presetForUserAgent(CODEX_USER_AGENT).preset).toBe("codex_cli_rs");
    expect(presetForUserAgent("myapp/1.0")).toEqual({ preset: "custom", custom: "myapp/1.0" });
  });
  it("stays in sync with clientVersions.js (drift = update uaPresets.js)", () => {
    const byValue = Object.fromEntries(UA_PRESET_OPTIONS.map((o) => [o.value, o.ua]));
    expect(byValue.claude_code).toBe(CLAUDE_CLI_USER_AGENT);
    expect(byValue.codex_cli_rs).toBe(CODEX_USER_AGENT);
    expect(byValue.copilot).toBe(COPILOT_USER_AGENT);
    // Antigravity UA is platform-dependent at runtime (darwin/arm64 is the
    // official captured fingerprint); the preset pins that stable value.
    expect(byValue.antigravity.startsWith(`antigravity/ide/${ANTIGRAVITY_IDE_VERSION} `)).toBe(true);
    expect(byValue.gemini_cli).toBe(GEMINI_CLI_API_CLIENT);
    expect(byValue.kiro).toBe(KIRO_USER_AGENT);
    expect(byValue.trae).toBe(TRAE_USER_AGENT);
    expect(byValue.codebuddy_cn).toBe(CODEBUDDY_CN_TRANSPORT_UA);
    expect(byValue.codebuddy_intl).toBe(CODEBUDDY_INTL_TRANSPORT_UA);
    expect(byValue.grok_cli).toBe(GROK_CLI_USER_AGENT);
    expect(byValue.kimchi).toBe(KIMCHI_USER_AGENT);
    expect(byValue.zed).toBe(ZED_USER_AGENT);
    expect(byValue.iflow).toBe(IFLOW_USER_AGENT);
  });
});

describe("node UA selector (curated 5)", () => {
  it("exposes exactly the 5 node choices", () => {
    expect(NODE_UA_PRESET_OPTIONS.map((o) => o.value)).toEqual([
      "krouter9", "opencode", "claude_code", "browser", "custom",
    ]);
  });
  it("9router default resolves to krouter9/<version>", () => {
    expect(resolveNodeUserAgentPreset("krouter9", "")).toMatch(/^krouter9\/\d/);
  });
  it("opencode resolves to the opencode UA", () => {
    expect(resolveNodeUserAgentPreset("opencode", "")).toBe(OPENCODE_USER_AGENT);
  });
  it("browser resolves to a Mozilla UA", () => {
    expect(resolveNodeUserAgentPreset("browser", "")).toBe(BROWSER_USER_AGENT);
  });
  it("claude_code matches the shared constant", () => {
    expect(resolveNodeUserAgentPreset("claude_code", "")).toBe(CLAUDE_CLI_USER_AGENT);
  });
  it("round-trips stored UA back to a node preset", () => {
    expect(presetForNodeUserAgent("").preset).toBe("krouter9");
    expect(presetForNodeUserAgent("krouter9/0.5.78").preset).toBe("krouter9");
    expect(presetForNodeUserAgent(OPENCODE_USER_AGENT).preset).toBe("opencode");
    expect(presetForNodeUserAgent(BROWSER_USER_AGENT).preset).toBe("browser");
    expect(presetForNodeUserAgent(CLAUDE_CLI_USER_AGENT).preset).toBe("claude_code");
    expect(presetForNodeUserAgent("myapp/1.0")).toEqual({ preset: "custom", custom: "myapp/1.0" });
  });
  it("stays in sync with clientVersions for opencode/browser", () => {
    expect(resolveNodeUserAgentPreset("opencode", "")).toBe(OPENCODE_USER_AGENT);
    expect(resolveNodeUserAgentPreset("browser", "")).toBe(BROWSER_USER_AGENT);
  });
});
