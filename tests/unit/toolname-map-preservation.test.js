// Tool-name map preservation across format converters.
//
// translateRequest() compresses >64-char tool names FIRST (compressToolNames)
// and stores short->original in body._toolNameMap. Format converters must
// MERGE that incoming map into the map they attach — not overwrite it —
// otherwise responses restore to the compressed hash name instead of the
// client-original name. Selective port of VansRouter b56edf67 (Issue #148);
// the central ensureFittedToolNames is NOT ported (compressToolNames already
// covers it) and the counter scheme is NOT adopted (tree standard is the
// deterministic hash scheme).
import { describe, expect, it } from "vitest";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";
import { openaiToGeminiRequest } from "../../open-sse/translator/request/openai-to-gemini.js";
import { sanitizeFunctionName } from "../../open-sse/executors/antigravity.js";

const LONG_ORIGINAL_A =
  "mcp__very_long_tool_name_for_prefix_collision_testing_alpha_version_one";
const LONG_ORIGINAL_B =
  "mcp__very_long_tool_name_for_prefix_collision_testing_beta_version_two";

function chatTool(name) {
  return { type: "function", function: { name, parameters: { type: "object", properties: {} } } };
}

describe("converter preserves incoming _toolNameMap", () => {
  it("openai->claude merges instead of overwriting", () => {
    const incoming = new Map([["short_hash_1", LONG_ORIGINAL_A]]);
    const body = { messages: [{ role: "user", content: "hi" }], tools: [chatTool("echo")] };
    body._toolNameMap = incoming;
    const result = openaiToClaudeRequest("claude-opus-4-8", body, false);
    expect(result._toolNameMap?.get("short_hash_1")).toBe(LONG_ORIGINAL_A);
  });

  it("openai->gemini composes sanitized names back to client-originals", () => {
    // Converter receives the COMPRESSED name; the client-original lives in the
    // incoming map. Gemini re-sanitizes (space is illegal) — the final map
    // must still resolve to the client-original, not the compressed name.
    const compressed = "my tool with spaces";
    const incoming = new Map([[compressed, LONG_ORIGINAL_B]]);
    const body = { messages: [{ role: "user", content: "hi" }], tools: [chatTool(compressed)] };
    body._toolNameMap = incoming;
    const result = openaiToGeminiRequest("gemini-2.0-flash", body, false);
    const values = [...(result._toolNameMap?.values() || [])];
    expect(values).toContain(LONG_ORIGINAL_B);
    expect(values).not.toContain(compressed);
  });
});

describe("antigravity executor sanitizer (VansRouter #148)", () => {
  it("keeps two prefix-sharing long names distinct and within 64 chars", () => {
    const a =
      "mcp__very_long_tool_name_for_prefix_collision_testing_alpha_version_one_extra";
    const b =
      "mcp__very_long_tool_name_for_prefix_collision_testing_beta_version_two_extra";
    const sa = sanitizeFunctionName(a);
    const sb = sanitizeFunctionName(b);
    expect(sa.length).toBeLessThanOrEqual(64);
    expect(sb.length).toBeLessThanOrEqual(64);
    expect(sa).not.toBe(sb);
    // Deterministic: same input, same output (prompt caching stays valid).
    expect(sanitizeFunctionName(a)).toBe(sa);
    // Short names pass through untouched.
    expect(sanitizeFunctionName("read")).toBe("read");
  });
});
