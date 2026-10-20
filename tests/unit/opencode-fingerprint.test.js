import { describe, it, expect } from "vitest";
import {
  applyFingerprintTools,
  concealFingerprintToolNames,
  appendMissingFingerprintTools,
  fingerprintToolKey,
  restoreToolNames,
  takeRenamedToolNames,
  OPENCODE_FINGERPRINT_TOOLS,
} from "open-sse/utils/opencodeFingerprint.js";

const CC_TOOLS = ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", "WebFetch"];
const flat = (names) => names.map((name) => ({ type: "function", name }));
const chat = (names) => names.map((name) => ({ type: "function", function: { name } }));

describe("opencodeFingerprint — request side", () => {
  it("preserves capitalised caller tools alongside the v2 fingerprint", () => {
    const body = { tools: flat(CC_TOOLS) };
    const map = applyFingerprintTools(body, true);
    const names = body.tools.map((tool) => tool.name);

    expect(names).toContain("read");
    expect(names).toContain("Bash");
    expect(names).toContain("Edit");
    expect(map.size).toBe(0);
  });

  it("preserves caller case variants without duplicating fingerprint names", () => {
    const body = { tools: flat(["Bash", "bash", "Glob", "grep", "Read", "Foo", "foo"]) };
    applyFingerprintTools(body, true);

    const names = body.tools.map((tool) => tool.name);
    expect(names.filter((name) => name === "bash")).toHaveLength(1);
    expect(names).toContain("Foo");
    expect(names).toContain("foo");
  });

  it("adds the v2 pair without dropping any capitalised caller tools", () => {
    const body = { tools: flat(CC_TOOLS) };
    applyFingerprintTools(body, true);
    expect(body.tools).toHaveLength(CC_TOOLS.length + 2);
  });

  it("handles the nested chat shape without dropping .function", () => {
    const body = { tools: chat(CC_TOOLS) };
    applyFingerprintTools(body, false);

    const names = body.tools.map((tool) => tool.function.name);
    expect(names).toContain("shell");
    expect(names).toContain("Bash");
    expect(body.tools[1].function.name).toBe("Bash");
  });

  it("injects both v2 fingerprint tools when the body carries no tools", () => {
    const body = { tools: [] };
    applyFingerprintTools(body, true);

    expect(body.tools.map((tool) => tool.name).sort()).toEqual([...OPENCODE_FINGERPRINT_TOOLS].sort());
    expect(body.tool_choice).toBe("auto");
  });

  it("does not default chat tool_choice to the rejected none value", () => {
    const body = {};
    applyFingerprintTools(body, false);

    expect(body.tools.map((tool) => tool.function.name)).toEqual(OPENCODE_FINGERPRINT_TOOLS);
    expect(body.tool_choice).toBeUndefined();
  });

  it("does not invent a chat tool_choice when the caller already supplied tools", () => {
    const body = { tools: chat(["Edit"]) };
    applyFingerprintTools(body, false);
    expect(body.tool_choice).toBeUndefined();
  });

  it("appends the v2 pair beside unrelated caller tools", () => {
    const body = { tools: flat(["Bash", "Read", "terminal"]) };
    applyFingerprintTools(body, true);

    const names = body.tools.map((tool) => tool.name);
    expect(names).toContain("read");
    expect(names).toContain("shell");
    expect(names).toContain("terminal");
    expect(body.tools).toHaveLength(5);
  });

  it("retargets flat tool_choice that points at a renamed tool", () => {
    const body = { tools: flat(["shell"]), tool_choice: { type: "function", name: "shell" } };
    applyFingerprintTools(body, true);
    expect(body.tool_choice.name).toBe("shell_client");
  });

  it("retargets nested tool_choice that points at a renamed tool", () => {
    const body = {
      tools: chat(["read"]),
      tool_choice: { type: "function", function: { name: "read" } },
    };
    applyFingerprintTools(body, false);
    expect(body.tool_choice.function.name).toBe("read_client");
  });

  it("records the rename map against the body for the response side", () => {
    const body = { tools: flat(["read"]) };
    const map = applyFingerprintTools(body, true);
    expect(takeRenamedToolNames(body)).toBe(map);
  });

  it("never throws on malformed tools", () => {
    for (const tools of [null, undefined, "nope", [null, 42, []], [{}, { name: "" }]]) {
      expect(() => concealFingerprintToolNames(tools)).not.toThrow();
      expect(() => appendMissingFingerprintTools(tools, true)).not.toThrow();
    }
  });

  it("keeps the keyed append-only helper contract and legacy quartet", () => {
    const bash = chat(["Bash"])[0];
    const tools = [bash];
    expect(appendMissingFingerprintTools(tools, false)).toBe(tools);
    expect(tools.map((tool) => tool.function.name)).toEqual(["Bash", "glob", "grep", "read"]);
    expect(tools[0]).toBe(bash);
    expect(appendMissingFingerprintTools(undefined, true).map((tool) => tool.name))
      .toEqual(["bash", "glob", "grep", "read"]);
  });

  it("aliases conflicting definitions without collisions and restores responses", () => {
    const caller = { type: "function", name: "read", description: "Caller read", parameters: { type: "object" } };
    const body = { tools: [caller, ...flat(["read_client", "read_client2", "read"]) ] };
    const map = applyFingerprintTools(body, true);
    expect(body.tools.map((tool) => tool.name)).toEqual(["read_client3", "read_client", "read_client2", "read", "shell"]);
    expect(body.tools[0]).toEqual({ ...caller, name: "read_client3" });
    expect(caller.name).toBe("read");
    expect(map.get("read_client3")).toBe("read");
    expect(restoreToolNames({ output: [{ type: "function_call", name: "read_client3" }] }, map).output[0].name).toBe("read");
  });

  it("aliases prior calls in chat and Responses history without mutating caller items", () => {
    const item = { type: "function_call", name: "read", call_id: "c1", arguments: "{}" };
    const message = { role: "assistant", tool_calls: [{ id: "c2", function: { name: "shell", arguments: "{}" } }] };
    const body = { tools: flat(["read", "shell"]), input: [item], messages: [message] };
    applyFingerprintTools(body, true);
    expect(body.input[0]).toEqual({ ...item, name: "read_client" });
    expect(body.messages[0].tool_calls[0].function.name).toBe("shell_client");
    expect(item.name).toBe("read");
    expect(message.tool_calls[0].function.name).toBe("shell");
  });

  it("reuses exact definitions and keeps repeated application idempotent", () => {
    const body = { instructions: "Caller instructions", tools: flat(["read"]) };
    const map = applyFingerprintTools(body, true);
    const tools = body.tools.slice();
    const instructions = body.instructions;
    applyFingerprintTools(body, true);
    expect(body.tools).toEqual(tools);
    expect(body.tools.at(-1)).toBe(tools.at(-1));
    expect(body.instructions).toBe(instructions);
    expect(takeRenamedToolNames(body)).toBe(map);
    expect(instructions).toContain("Caller instructions");
    expect(instructions).toContain("Do not call the `read` or `shell` tools");
  });

  it("adds placeholder guidance without overwriting chat system instructions", () => {
    const system = { role: "system", content: "Caller policy" };
    const body = { messages: [system, { role: "user", content: "hello" }] };
    applyFingerprintTools(body, false);
    expect(body.messages[0].content).toContain("Caller policy\n\nDo not call the `read` or `shell` tools");
    expect(system.content).toBe("Caller policy");
    expect(body.messages[1]).toEqual({ role: "user", content: "hello" });
  });

  it("injects the exact v2 read and shell schemas instead of empty stubs", () => {
    const body = {};
    applyFingerprintTools(body, true);
    expect(body.tools.map((tool) => tool.name)).toEqual(["read", "shell"]);
    const [read, shell] = body.tools;
    expect(read.description).toBe("Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.");
    expect(read.parameters).toEqual({
      type: "object", properties: {
        path: { type: "string", description: "File or directory to read" },
        offset: { type: "integer", minimum: 0, description: "The line or directory entry to start reading from (1-based)" },
        limit: { type: "integer", minimum: 0, description: "The maximum number of lines or directory entries to read (defaults to and capped at 2000)" },
      }, required: ["path"], additionalProperties: false,
    });
    expect(shell.description).toBe("Execute a shell command and return its output. Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.");
    expect(shell.parameters).toEqual({
      type: "object", properties: {
        command: { type: "string", description: "Shell command string to execute" },
        workdir: { type: "string", description: "Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead." },
        timeout: { type: "integer", minimum: 0, description: "Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default." },
        background: { type: "boolean", description: "Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion." },
      }, required: ["command"], additionalProperties: false,
    });
    expect(read.strict).toBe(false);
    expect(shell.strict).toBe(false);
  });
});

describe("opencodeFingerprint — response side", () => {
  const map = new Map([["bash", "Bash"], ["grep", "Grep"], ["read", "Read"]]);

  it("restores names in Claude content_block_start chunks", () => {
    const chunk = {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "bash", id: "t1" },
    };
    const out = restoreToolNames(chunk, map);

    expect(out.content_block.name).toBe("Bash");
    expect(chunk.content_block.name).toBe("bash");
  });

  it("recursively restores streaming chunks inside arrays", () => {
    const chunks = [{
      choices: [{ delta: { tool_calls: [{ function: { name: "grep", arguments: "{}" } }] } }],
    }];
    const out = restoreToolNames(chunks, map);
    expect(out[0].choices[0].delta.tool_calls[0].function.name).toBe("Grep");
  });

  it("restores names in Claude non-streaming bodies", () => {
    const body = { type: "message", content: [{ type: "tool_use", name: "bash", input: {} }] };
    expect(restoreToolNames(body, map).content[0].name).toBe("Bash");
  });

  it("restores names in Chat Completions message and delta shapes", () => {
    const body = {
      choices: [
        { message: { tool_calls: [{ function: { name: "grep", arguments: "{}" } }] } },
        { delta: { tool_calls: [{ function: { name: "read", arguments: "{}" } }] } },
      ],
    };
    const out = restoreToolNames(body, map);

    expect(out.choices[0].message.tool_calls[0].function.name).toBe("Grep");
    expect(out.choices[1].delta.tool_calls[0].function.name).toBe("Read");
  });

  it("restores names in Responses final output items", () => {
    const body = { output: [{ type: "function_call", name: "bash", call_id: "c1" }] };
    expect(restoreToolNames(body, map).output[0].name).toBe("Bash");
  });

  it("restores names in Responses streaming output_item events", () => {
    const event = {
      type: "response.output_item.added",
      item: { type: "function_call", name: "read", call_id: "c1" },
    };
    expect(restoreToolNames(event, map).item.name).toBe("Read");
  });

  it("is a no-op without a map or with an empty map", () => {
    const body = { choices: [{ message: { tool_calls: [{ function: { name: "bash" } }] } }] };
    expect(restoreToolNames(body, null)).toBe(body);
    expect(restoreToolNames(body, new Map())).toBe(body);
  });

  it("leaves unknown tool names untouched", () => {
    const body = { output: [{ type: "function_call", name: "Edit" }] };
    expect(restoreToolNames(body, map).output[0].name).toBe("Edit");
  });
});

describe("fingerprintToolKey", () => {
  it("matches only the exact v2 names after trimming whitespace", () => {
    expect(fingerprintToolKey("read")).toBe("read");
    expect(fingerprintToolKey(" shell ")).toBe("shell");
    expect(fingerprintToolKey("GLOB")).toBe("");
    expect(fingerprintToolKey("Read")).toBe("");
    expect(fingerprintToolKey("Edit")).toBe("");
    expect(fingerprintToolKey("terminal")).toBe("");
    expect(fingerprintToolKey(null)).toBe("");
  });
});
