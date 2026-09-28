import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import {
  OpenCodeExecutor,
  OPENCODE_DECOY_CHAT_TOOLS,
  OPENCODE_DECOY_RESPONSES_TOOLS,
} from "../../open-sse/executors/opencode.js";

// Selective port of upstream PR #4146 head 7b56f179 ONLY:
// exact-case decoy matching + unconditional cloakOpencodeTools(body, true) on the
// Responses free-tier path + tool_choice default only when the caller sent none.
// The quartet approach (822aa958) is reference-only and explicitly NOT ported.

const FREE_13 = "muse-spark-1.3-contributor-free";
const FREE_12 = "muse-spark-1.2-contributor-free";
const CREDS = { connectionId: "opencode-free-tier-cloak-test" };
const INPUT = [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }];
const TOOLS = [{ type: "function", name: "get_weather", description: "w", parameters: { type: "object", properties: {} } }];
const EXPECTED_TOOLS = [...TOOLS, ...OPENCODE_DECOY_RESPONSES_TOOLS];

function responsesBody(model, tools, tool_choice) {
  const body = { model, input: structuredClone(INPUT) };
  if (tools !== undefined) body.tools = structuredClone(tools);
  if (tool_choice !== undefined) body.tool_choice = structuredClone(tool_choice);
  return body;
}

function chatBody(model, tools, tool_choice) {
  const body = { model, messages: [{ role: "user", content: "hi" }] };
  if (tools !== undefined) body.tools = structuredClone(tools);
  if (tool_choice !== undefined) body.tool_choice = structuredClone(tool_choice);
  return body;
}

describe("opencode free-tier cloak (#4146/7b56f179)", () => {
  it("registry declares forceStream + forceAutoToolChoiceModels quirk", () => {
    expect(PROVIDERS.opencode.forceStream).toBe(true);
    expect(PROVIDERS.opencode.quirks?.forceAutoToolChoiceModels).toEqual([FREE_13]);
  });

  it("decoy sets cover exact-case bash + read in both shapes", () => {
    expect(OPENCODE_DECOY_RESPONSES_TOOLS.map((t) => t.name)).toEqual(["bash", "read"]);
    expect(OPENCODE_DECOY_CHAT_TOOLS.map((t) => t.function.name)).toEqual(["bash", "read"]);
  });

  it("Responses: custom tools present still get decoys appended (unconditional cloak)", () => {
    const out = new OpenCodeExecutor().transformRequest(
      FREE_13, responsesBody(FREE_13, TOOLS, undefined), true, CREDS,
    );
    expect(out.tools).toEqual(EXPECTED_TOOLS);
    expect("tool_choice" in out).toBe(false);
    expect(out.input).toEqual(INPUT);
  });

  it("Responses: exact-case match — PascalCase Bash does not block lowercase bash decoy", () => {
    const pascal = [{ type: "function", name: "Bash", description: "c", parameters: { type: "object", properties: {} } }];
    const out = new OpenCodeExecutor().transformRequest(
      FREE_13, responsesBody(FREE_13, pascal, undefined), true, CREDS,
    );
    const names = out.tools.map((t) => t.name);
    expect(names).toContain("Bash");
    expect(names).toContain("bash");
    expect(names).toContain("read");
  });

  it("Responses: absent tools get decoys + tool_choice auto default", () => {
    const out = new OpenCodeExecutor().transformRequest(
      FREE_13, responsesBody(FREE_13, undefined, undefined), true, CREDS,
    );
    expect(out.tools).toEqual(OPENCODE_DECOY_RESPONSES_TOOLS);
    expect(out.tool_choice).toBe("auto");
  });

  it("Responses: null entries in tools are null-safe, decoys still injected", () => {
    const out = new OpenCodeExecutor().transformRequest(
      FREE_13, responsesBody(FREE_13, [null, ...structuredClone(TOOLS)], undefined), true, CREDS,
    );
    const names = out.tools.filter(Boolean).map((t) => t.name);
    expect(names).toContain("get_weather");
    expect(names).toContain("bash");
    expect(names).toContain("read");
  });

  it.each([
    ["Responses named", { type: "function", name: "get_weather" }],
    ["Chat function named", { type: "function", function: { name: "get_weather" } }],
    ["required", "required"],
    ["none", "none"],
  ])("demotes %s to auto on 1.3-Free (plain and max suffix)", (_label, choice) => {
    for (const model of [FREE_13, `${FREE_13}(max)`]) {
      const out = new OpenCodeExecutor().transformRequest(
        model, responsesBody(model, TOOLS, structuredClone(choice)), true, CREDS,
      );
      expect(out.tool_choice).toBe("auto");
      expect(out.tools).toEqual(EXPECTED_TOOLS);
    }
  });

  it("keeps auto and absent tool_choice on 1.3-Free; tools cloaked either way", () => {
    const autoOut = new OpenCodeExecutor().transformRequest(
      FREE_13, responsesBody(FREE_13, TOOLS, "auto"), true, CREDS,
    );
    expect(autoOut.tool_choice).toBe("auto");
    expect(autoOut.tools).toEqual(EXPECTED_TOOLS);

    const absentOut = new OpenCodeExecutor().transformRequest(
      FREE_13, responsesBody(FREE_13, TOOLS, undefined), true, CREDS,
    );
    expect("tool_choice" in absentOut).toBe(false);
    expect(absentOut.tools).toEqual(EXPECTED_TOOLS);
  });

  it.each([
    ["1.2-Free", FREE_12],
    ["non-Muse", "big-pickle"],
  ])("does not demote tool_choice of %s", (_label, model) => {
    const choice = { type: "function", name: "get_weather" };
    const out = new OpenCodeExecutor().transformRequest(
      model, responsesBody(model, TOOLS, structuredClone(choice)), true, CREDS,
    );
    expect(out.tool_choice).toEqual(choice);
  });

  it("Chat: absent tools get chat decoys + tool_choice none", () => {
    const out = new OpenCodeExecutor().transformRequest(
      "big-pickle", chatBody("big-pickle", undefined, undefined), true, CREDS,
    );
    expect(out.tools).toEqual(OPENCODE_DECOY_CHAT_TOOLS);
    expect(out.tool_choice).toBe("none");
  });

  it("Chat: existing tools get only the missing decoys appended", () => {
    const chatTools = [{ type: "function", function: { name: "get_weather", description: "w", parameters: { type: "object", properties: {} } } }];
    const out = new OpenCodeExecutor().transformRequest(
      "big-pickle", chatBody("big-pickle", chatTools, undefined), true, CREDS,
    );
    expect(out.tools.map((t) => t.function.name)).toEqual(["get_weather", "bash", "read"]);
    expect("tool_choice" in out).toBe(false);
  });
});
