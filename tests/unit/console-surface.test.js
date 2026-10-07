import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterTokenRefreshSpam } from "../../src/app/(dashboard)/dashboard/console-log/tokenRefreshSpam.js";
import { redactSensitiveText } from "../../src/lib/proxyMask.js";

const hookHarness = { cursor: 0, states: [] };
const testReact = {
  ...React,
  useCallback: (callback) => callback,
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  useRef: (initialValue) => ({ current: initialValue }),
  useState: (initialValue) => {
    const index = hookHarness.cursor++;
    if (!(index in hookHarness.states)) {
      hookHarness.states[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    }
    const setValue = (nextValue) => {
      hookHarness.states[index] = typeof nextValue === "function"
        ? nextValue(hookHarness.states[index])
        : nextValue;
    };
    return [hookHarness.states[index], setValue];
  },
};

const sourcePath = new URL("../../src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js", import.meta.url);
const compiledClient = transformSync(readFileSync(sourcePath, "utf8"), {
  filename: sourcePath.pathname,
  presets: [[presetReact, { runtime: "classic" }]],
  plugins: [transformModulesCommonjs],
}).code;

const Icon = (props) => React.createElement("svg", props);
const moduleMocks = {
  react: testReact,
  "lucide-react": {
    Check: Icon,
    ChevronDown: Icon,
    Clipboard: Icon,
    Trash2: Icon,
  },
  "@/shared/components/overlays": {
    ConfirmDialog: ({ open, title }) => open ? React.createElement("div", { role: "dialog" }, title) : null,
    PopoverMenu: ({ open, label, children }) => open
      ? React.createElement("div", { role: "menu", "aria-label": label }, children)
      : null,
  },
  "@/shared/constants/config": { CONSOLE_LOG_CONFIG: { maxLines: 500 } },
  "./tokenRefreshSpam": { filterTokenRefreshSpam },
  "@/lib/proxyMask.js": { redactSensitiveText },
};

const clientModule = { exports: {} };
new Function("require", "module", "exports", "React", compiledClient)(
  (specifier) => {
    if (!(specifier in moduleMocks)) throw new Error(`Unexpected console import: ${specifier}`);
    return moduleMocks[specifier];
  },
  clientModule,
  clientModule.exports,
  testReact,
);
const ConsoleLogClient = clientModule.exports.default;

function resetCursor() {
  hookHarness.cursor = 0;
}

function renderClient() {
  resetCursor();
  return renderToStaticMarkup(React.createElement(ConsoleLogClient));
}

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function clientTree() {
  resetCursor();
  return ConsoleLogClient();
}

describe("console log dashboard surface", () => {
  beforeEach(() => {
    hookHarness.cursor = 0;
    hookHarness.states = [];
    hookHarness.states[0] = [
      "[12:30:00] [INFO] [router] request accepted",
      "[12:30:01] [ERROR] [upstream] request failed",
    ];
  });

  it("renders retained logs as structured, operational rows", () => {
    const html = renderClient();

    expect(html).toContain(">Console log</h1>");
    expect(html).toContain("Sanitized gateway events");
    expect(html).toContain("2/500");
    expect(html).toContain("12:30:00");
    expect(html).toContain("INFO");
    expect(html).toContain("router");
    expect(html).toContain("request accepted");
    expect(html).toContain("2 visible / 2 retained");
  });

  it("filters retained rows from the search control", () => {
    const search = findElement(
      clientTree(),
      (node) => node.type === "input" && node.props.placeholder === "Search logs",
    );
    search.props.onChange({ target: { value: "failed" } });

    const html = renderClient();
    expect(html).toContain("request failed");
    expect(html).not.toContain("request accepted");
    expect(html).toContain("1 visible / 2 retained");
  });

  it("pauses the live stream and reports buffered state", () => {
    const pause = findElement(
      clientTree(),
      (node) => node.type === "button" && node.props.role === "radio" && node.props.children === "Pause",
    );
    pause.props.onClick();

    const html = renderClient();
    expect(html).toContain("Paused — 0 new lines buffered.");
    expect(html).toContain("Live tail off");
  });

  it("copies only the currently visible sanitized lines", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { setTimeout: vi.fn() });
    const search = findElement(
      clientTree(),
      (node) => node.type === "input" && node.props.placeholder === "Search logs",
    );
    search.props.onChange({ target: { value: "accepted" } });
    const copy = findElement(
      clientTree(),
      (node) => node.type === "button" && React.Children.toArray(node.props.children).includes("Copy visible"),
    );

    await copy.props.onClick();

    expect(writeText).toHaveBeenCalledWith("[12:30:00] [INFO] [router] request accepted");
    vi.unstubAllGlobals();
  });
});
