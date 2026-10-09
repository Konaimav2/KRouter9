import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookHarness = { cursor: 0, states: [], copiedValues: [] };
const testReact = {
  ...React,
  useCallback: (callback) => callback,
  useEffect: () => undefined,
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

const sourcePath = new URL("../../src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js", import.meta.url);
const compiledClient = transformSync(readFileSync(sourcePath, "utf8"), {
  filename: sourcePath.pathname,
  presets: [[presetReact, { runtime: "classic" }]],
  plugins: [transformModulesCommonjs],
}).code;

const Button = ({ children, ...props }) => React.createElement("button", props, children);
const Input = (props) => React.createElement("input", props);
const Toggle = ({ checked, onChange, ...props }) => React.createElement("input", {
  ...props,
  type: "checkbox",
  checked,
  onChange: (event) => onChange?.(event.target.checked),
});
const Icon = (props) => React.createElement("svg", props);
const moduleMocks = {
  react: testReact,
  "prop-types": { __esModule: true, default: { string: { isRequired: true } } },
  "@/shared/components": {
    Button,
    Input,
    CardSkeleton: () => React.createElement("div", null, "Loading endpoint configuration"),
    Toggle,
  },
  "@/shared/components/overlays": {
    Dialog: ({ open, title, children }) => open ? React.createElement("div", { role: "dialog", "aria-label": title }, children) : null,
    ConfirmDialog: ({ open, title }) => open ? React.createElement("div", { role: "dialog" }, title) : null,
  },
  "lucide-react": new Proxy({}, { get: () => Icon }),
  "@/shared/hooks/useCopyToClipboard": {
    useCopyToClipboard: () => ({
      copied: false,
      copy: (value) => hookHarness.copiedValues.push(value),
    }),
  },
  "./endpointConstants": {
    TUNNEL_BENEFITS: [],
    TUNNEL_PING_INTERVAL_MS: 2000,
    TUNNEL_PING_MAX_MS: 30000,
    STATUS_POLL_FAST_MS: 5000,
    REACHABLE_MISS_THRESHOLD: 2,
    CLIENT_PING_FAST_MS: 5000,
  },
  "./endpointPing": {
    clientPingUrl: vi.fn(),
    clientPingAny: vi.fn(),
  },
  "./components/EndpointRow": {
    __esModule: true,
    default: ({ label, url, status, access, actions }) => React.createElement(
      "div",
      { "data-endpoint": label },
      `${label}|${url}|${status}|${access}`,
      actions,
    ),
  },
  "./components/ManageKeyModal": { __esModule: true, default: () => null },
  "./components/StatusAlert": { __esModule: true, default: ({ status }) => React.createElement("p", null, status.message) },
  "./components/Tooltip": { __esModule: true, default: ({ children }) => children },
  "./components/SecurityWarning": { __esModule: true, default: ({ message }) => React.createElement("p", null, message) },
};

const clientModule = { exports: {} };
new Function("require", "module", "exports", "React", compiledClient)(
  (specifier) => {
    if (!(specifier in moduleMocks)) throw new Error(`Unexpected endpoint import: ${specifier}`);
    return moduleMocks[specifier];
  },
  clientModule,
  clientModule.exports,
  testReact,
);
const EndpointPageClient = clientModule.exports.default;

function resetCursor() {
  hookHarness.cursor = 0;
}

function renderClient() {
  resetCursor();
  return renderToStaticMarkup(React.createElement(EndpointPageClient, { machineId: "test-machine" }));
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
  return EndpointPageClient({ machineId: "test-machine" });
}

const keys = [
  {
    id: "key-a",
    name: "Alpha production",
    key: "sk-alpha-super-secret-1234",
    createdAt: "2026-10-01T00:00:00.000Z",
    isActive: true,
    modelPolicy: "all",
    rpmLimit: 0,
  },
  {
    id: "key-b",
    name: "Beta paused",
    key: "sk-beta-super-secret-5678",
    createdAt: "2026-10-02T00:00:00.000Z",
    isActive: false,
    modelPolicy: "whitelist",
    allowedModels: "[\"model-a\"]",
    rpmLimit: 20,
  },
];

describe("endpoint and API key dashboard surface", () => {
  beforeEach(() => {
    hookHarness.cursor = 0;
    hookHarness.copiedValues = [];
    hookHarness.states = [];
    hookHarness.states[0] = keys;
    hookHarness.states[1] = false;
    hookHarness.states[11] = true;
    hookHarness.states[12] = true;
    hookHarness.states[13] = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders endpoint status and masked API key rows", () => {
    const html = renderClient();

    expect(html).toContain("Endpoint &amp; API keys");
    expect(html).toContain("Local|/v1|Reachable|Host");
    expect(html).toContain("Cloudflare|Not configured|Off|API only");
    expect(html).toContain("Tailscale|Not configured|Off|API only");
    expect(html).toContain("Alpha production");
    expect(html).toContain("Beta paused");
    expect(html).not.toContain("sk-alpha-super-secret-1234");
    expect(html).toContain("20 RPM");
    expect(html).toContain("1 allowed");
  });

  it("filters key rows by search and paused status", () => {
    let tree = clientTree();
    const search = findElement(tree, (node) => node.type === "input" && node.props.placeholder === "Search keys");
    search.props.onChange({ target: { value: "Beta" } });

    tree = clientTree();
    const status = findElement(tree, (node) => node.type === "select" && node.props.value === "all");
    status.props.onChange({ target: { value: "paused" } });

    const html = renderClient();
    expect(html).toContain("API keys <span class=\"font-normal text-text-muted\">(1)</span>");
    expect(html).toContain("Beta paused");
    expect(html).not.toContain("Alpha production");
  });

  it("reveals a key only after the guarded reveal fetch resolves", async () => {
    vi.useFakeTimers();
    const key = "sk-alpha-super-secret-1234";
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe("/api/keys/key-a/reveal?confirm=true");
      return { ok: true, status: 200, json: async () => ({ key }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const show = findElement(
      clientTree(),
      (node) => node.type === "button" && node.props["aria-label"] === "Show Alpha production key",
    );
    const htmlBefore = renderClient();
    expect(htmlBefore).not.toContain("sk-alpha-super-secret-1234");

    await show.props.onClick();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const html = renderClient();
    expect(html).toContain(key);
    expect(html).toContain("Hide Alpha production key");
    expect(html).not.toContain("sk-beta-super-secret-5678");
  });

  it("copies the selected full key through the guarded reveal read then clipboard", async () => {
    const key = "sk-beta-super-secret-5678";
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe("/api/keys/key-b/reveal?confirm=true");
      return { ok: true, status: 200, json: async () => ({ key }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const copy = findElement(
      clientTree(),
      (node) => node.type === "button" && node.props["aria-label"] === "Copy Beta paused key",
    );
    await copy.props.onClick();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hookHarness.copiedValues).toEqual([key]);
  });
});
