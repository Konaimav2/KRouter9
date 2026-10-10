import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("Wave C console levels affordance", () => {
  beforeEach(() => {
    hookHarness.cursor = 0;
    hookHarness.states = [];
    hookHarness.states[0] = [
      "[12:30:00] [INFO] [router] request accepted",
      "[12:30:01] [ERROR] [upstream] request failed",
    ];
  });

  it("shows all, subset, and zero selected counts on the Levels button", () => {
    expect(renderClient()).toContain("Levels (5/5)");
    const toggle = findElement(clientTree(), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu");
    toggle.props.onClick();
    for (const level of ["INFO", "LOG", "DEBUG"]) {
      const label = findElement(clientTree(), (n) => n.type === "label" && n.props.role === "menuitemcheckbox" && React.Children.toArray(n.props.children).includes(level));
      findElement(label, (n) => n.type === "input").props.onChange();
    }
    expect(renderClient()).toContain("Levels (2/5)");
    expect(renderClient()).toContain("request failed");
    expect(renderClient()).not.toContain("request accepted");
    for (const level of ["ERROR", "WARN"]) {
      const label = findElement(clientTree(), (n) => n.type === "label" && n.props.role === "menuitemcheckbox" && React.Children.toArray(n.props.children).includes(level));
      findElement(label, (n) => n.type === "input").props.onChange();
    }
    expect(renderClient()).toContain("Levels (0/5)");
    expect(renderClient()).toContain("No logs match these filters.");
  });
});
