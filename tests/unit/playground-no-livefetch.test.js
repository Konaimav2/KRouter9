import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it, vi } from "vitest";
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

function loadClient(effects) {
  const testReact = {
    ...React,
    useCallback: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
    useMemo: (factory) => factory(),
    useRef: (initialValue) => ({ current: initialValue }),
    useState: (initialValue) => [
      typeof initialValue === "function" ? initialValue() : initialValue,
      vi.fn(),
    ],
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
      isOpenAICompatibleProvider: () => false,
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

describe("playground model picker catalog sources", () => {
  it("never requests per-connection model endpoints", async () => {
    const effects = [];
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      calls.push(String(url));
      if (url === "/api/providers?mode=full") {
        return jsonResponse({
          connections: [{ id: "connection-1", provider: "openai", isActive: true }],
          customModels: [],
          modelAliases: {},
        });
      }
      if (url === "/api/models/disabled") return jsonResponse({ disabled: {} });
      if (url === "/api/combos") return jsonResponse({ combos: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const BasicChatPageClient = loadClient(effects);
    BasicChatPageClient();
    expect(effects.length).toBeGreaterThanOrEqual(3);
    effects[2]();
    for (let turn = 0; turn < 12 && calls.length < 4; turn += 1) {
      await Promise.resolve();
    }

    expect(calls).toEqual([
      "/api/providers?mode=full",
      "/api/models/disabled",
      "/api/combos",
      "/api/combos",
    ]);
    expect(calls.some((url) => /^\/api\/providers\/[^/]+\/models$/.test(url))).toBe(false);

    vi.unstubAllGlobals();
  });
});
