import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as playgroundModels from "../../src/shared/utils/playgroundModels.js";

const sourcePath = new URL(
  "../../src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js",
  import.meta.url,
);
const compiledClient = transformSync(readFileSync(sourcePath, "utf8"), {
  filename: sourcePath.pathname,
  presets: [[presetReact, { runtime: "classic" }]],
  plugins: [transformModulesCommonjs],
}).code;

function loadClient(effects, stateSetters) {
  let stateIndex = 0;
  const testReact = {
    ...React,
    useCallback: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
    useMemo: (factory) => factory(),
    useRef: (initialValue) => ({ current: initialValue }),
    useState: (initialValue) => {
      const setter = vi.fn();
      stateSetters[stateIndex] = setter;
      stateIndex += 1;
      return [typeof initialValue === "function" ? initialValue() : initialValue, setter];
    },
  };
  const passthrough = ({ children }) => children;
  const moduleMocks = {
    react: testReact,
    "next/link": { __esModule: true, default: passthrough },
    "@/shared/components/Icon": { __esModule: true, default: () => null },
    "@/shared/components": { Badge: passthrough, Button: passthrough },
    "@/shared/constants/models": {
      getModelsByProviderId: () => [{ id: "static-model", name: "Static model" }],
    },
    "open-sse/providers/thinkingLevels.js": { getThinkingLevels: () => null },
    "@/shared/constants/providers": {
      isAnthropicCompatibleProvider: () => false,
      isOpenAICompatibleProvider: () => true,
    },
    "@/shared/utils/playgroundModels.js": playgroundModels,
  };
  const clientModule = { exports: {} };
  new Function("require", "module", "exports", "React", compiledClient)(
    (specifier) => {
      if (!(specifier in moduleMocks)) throw new Error(`Unexpected playground import: ${specifier}`);
      return moduleMocks[specifier];
    },
    clientModule,
    clientModule.exports,
    testReact,
  );
  return clientModule.exports.default;
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

async function runLoader(fetchImpl) {
  const effects = [];
  const stateSetters = [];
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  const BasicChatPageClient = loadClient(effects, stateSetters);
  BasicChatPageClient();
  effects[2]();
  for (let turn = 0; turn < 20 && stateSetters[0].mock.calls.length === 0; turn += 1) {
    await Promise.resolve();
  }
  return stateSetters[0].mock.calls.at(-1)?.[0];
}

afterEach(() => vi.unstubAllGlobals());

describe("playground curated-store wiring", () => {
  it("includes custom-store models qualified with the connection alias", async () => {
    const groups = await runLoader(async (url) => {
      if (url === "/api/providers?mode=full") {
        return jsonResponse({
          connections: [{
            id: "connection-1",
            provider: "openai-compatible-connection-1",
            isActive: true,
            providerSpecificData: { prefix: "gripcla", nodeName: "GripClaude" },
          }],
        });
      }
      if (url === "/api/models/custom") {
        return jsonResponse({ models: [{ providerAlias: "gripcla", id: "curated-model", type: "llm", name: "Curated" }] });
      }
      if (url === "/api/models/alias") return jsonResponse({ aliases: {} });
      if (url === "/api/models/disabled") return jsonResponse({ disabled: {} });
      if (url === "/api/combos") return jsonResponse({ combos: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    expect(groups.flatMap((group) => group.models).map((model) => model.requestModel))
      .toContain("gripcla/curated-model");
  });

  it("still builds static groups when curated-store reads fail", async () => {
    const groups = await runLoader(async (url) => {
      if (url === "/api/providers?mode=full") {
        return jsonResponse({ connections: [{ id: "connection-1", provider: "openai", isActive: true }] });
      }
      if (url === "/api/models/custom" || url === "/api/models/alias") throw new Error("store unavailable");
      if (url === "/api/models/disabled") return jsonResponse({ disabled: {} });
      if (url === "/api/combos") return jsonResponse({ combos: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    expect(groups.flatMap((group) => group.models).map((model) => model.requestModel))
      .toContain("openai/static-model");
  });
});
