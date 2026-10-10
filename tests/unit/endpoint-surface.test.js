import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notices = [];
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
      copy: async (value) => { if (hookHarness.copyFails) throw new Error("clipboard denied"); hookHarness.copiedValues.push(value); },
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
    default: ({ label, url, status, access, actions, onCopy, copyId }) => React.createElement(
      "div",
      { "data-endpoint": label },
      `${label}|${url}|${status}|${access}`,
      React.createElement("button", { "aria-label": `Copy ${label} endpoint`, onClick: () => onCopy(url, copyId) }, "Copy"),
      actions,
    ),
  },
  "@/store/notificationStore": { useNotificationStore: { getState: () => ({ success: (message) => notices.push(["success", message]), error: (message) => notices.push(["error", message]) }) } },
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
    hookHarness.copyFails = false;
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

describe("endpoint wave A feedback", () => {
  beforeEach(() => { hookHarness.cursor = 0; hookHarness.states = [keys, false]; hookHarness.copyFails = false; notices.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("notifies successful and failed API-key requirement toggles without optimistic failure", async () => {
    const toggle = () => findElement(clientTree(), n => n.type === Toggle && n.props.size === "sm" && !n.props.title);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    await toggle().props.onChange(); expect(notices).toEqual([["success", "API key requirement enabled."]]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await toggle().props.onChange(); expect(notices.at(-1)).toEqual(["error", "Could not update API key requirement. Try again."]);
    expect(toggle().props.checked).toBe(true);
  });
  it("renders Cloudflare failure detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "fixture tunnel failure" }) })));
    await findElement(clientTree(), n => n.type === Button && n.props.children === "Start Tunnel").props.onClick();
    expect(renderClient()).toContain("fixture tunnel failure");
    expect(notices.at(-1)[0]).toBe("error");
  });
  it("notifies Cloudflare disable success and retains inline detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    await findElement(clientTree(), n => n.type === Button && n.props.variant === "danger" && n.props.onClick.name === "handleDisableTunnel").props.onClick();
    expect(notices.at(-1)).toEqual(["success", "Tunnel disabled"]);
    expect(renderClient()).toContain("Tunnel disabled");
  });
  it("reports rejected clipboard writes", async () => {
    hookHarness.copyFails = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ key: "fixture-key" }) })));
    await findElement(clientTree(), n => n.type === "button" && n.props["aria-label"] === "Copy Beta paused key").props.onClick();
    expect(notices.at(-1)).toEqual(["error", "Copy failed. Check clipboard permissions and try again."]);
  });
});


describe("wave A completion copy errors and expiry controls", () => {
  beforeEach(() => { hookHarness.cursor = 0; hookHarness.states = [keys, false]; hookHarness.copyFails = true; notices.length = 0; });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("reports local endpoint clipboard rejection", async () => {
    // EndpointRow is a functional child; inspect its public callback contract.
    const row = findElement(clientTree(), n => n.props?.label === "Local");
    await row.props.onCopy("/v1", "local_url");
    expect(notices.at(-1)).toEqual(["error", "Copy failed. Check clipboard permissions and try again."]);
  });
  it.each([["created_key", 4], ["rotated_key", 7]])("reports %s clipboard rejection", async (id, stateIndex) => {
    hookHarness.states[stateIndex] = "fixture-key";
    const button = findElement(clientTree(), n => n.type === Button && n.props.icon === "content_copy" && String(n.props.onClick).includes(id));
    await button.props.onClick();
    expect(notices.at(-1)).toEqual(["error", "Copy failed. Check clipboard permissions and try again."]);
  });
  it("offers a labeled optional expiry datetime and submits it as an ISO instant", async () => {
    hookHarness.states[2] = true;
    hookHarness.copyFails = false;
    let tree = clientTree();
    const input = findElement(tree, n => n.type === Input && n.props.type === "datetime-local");
    expect(input).not.toBeNull();
    expect(input.props.label).toBe("Expires at (optional)");
    input.props.onChange({ target: { value: "2999-01-01T12:00" } });
    findElement(tree, n => n.type === Input && n.props.label === "Key Name").props.onChange({ target: { value: "Temporary" } });
    const fetchMock = vi.fn(async (url, options) => options?.method === "POST" ? ({ ok: true, json: async () => ({ key: "fixture-key" }) }) : ({ ok: true, json: async () => ({ keys: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    await findElement(clientTree(), n => n.type === Button && n.props.onClick?.name === "handleCreateKey").props.onClick();
    const payload = JSON.parse(fetchMock.mock.calls.find(([,options]) => options?.method === "POST")[1].body);
    expect(payload.expiresAt).toBe(new Date("2999-01-01T12:00").toISOString());
  });
  it("badges only future keys expiring within 24 hours", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    hookHarness.states[0] = keys.map((key, index) => ({ ...key, expiresAt: index ? "2026-10-12T12:00:00Z" : "2026-10-10T18:00:00Z" }));
    expect(renderClient().match(/Expires within 24h/g)).toHaveLength(1);
  });
});

describe("real clipboard hook promise contract", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("returns the write promise to callers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => {} } });
    const source = readFileSync(new URL("../../src/shared/hooks/useCopyToClipboard.js", import.meta.url), "utf8").replace(/^import .*;$/m, "").replace("export function", "function");
    const hook = new Function("useState", "useCallback", "useRef", `${source}; return useCopyToClipboard;`)(() => [null, () => {}], callback => callback, () => ({ current: null }));
    const result = hook().copy("synthetic-value");
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("denied"); } } });
    await expect(hook().copy("synthetic-value")).rejects.toThrow("denied");
  });
});


describe("Wave H1 guarded key-operation toasts", () => {
  beforeEach(() => { hookHarness.cursor = 0; hookHarness.states = [keys, false]; hookHarness.copyFails = false; notices.length = 0; });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("announces successful creation without putting the secret in a notice", async () => {
    hookHarness.states[2] = true;
    findElement(clientTree(), n => n.type === Input && n.props.label === "Key Name").props.onChange({ target: { value: "Fixture" } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ key: "synthetic-secret", keys: [] }) })));
    await findElement(clientTree(), n => n.props.onClick?.name === "handleCreateKey").props.onClick();
    expect(notices).toContainEqual(["success", "API key created. Copy it before closing this dialog."]);
    expect(JSON.stringify(notices)).not.toContain("synthetic-secret");
  });
  it("announces successful reveal and its auto-hide deadline without secret text", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ key: "synthetic-secret" }) })));
    await findElement(clientTree(), n => n.props["aria-label"] === "Show Alpha production key").props.onClick();
    expect(notices).toEqual([["success", "API key revealed. It will hide after 15 seconds."]]);
  });
  it.each(["http", "payload", "network"])("announces %s reveal failures", async (kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => { if (kind === "network") throw new Error("network"); return { ok: kind !== "http", status: 401, json: async () => ({}) }; }));
    await findElement(clientTree(), n => n.props["aria-label"] === "Show Alpha production key").props.onClick();
    expect(notices).toEqual([["error", "Could not reveal API key. Try again."]]);
  });
  it("announces successful protected copy only after the clipboard write", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ key: "synthetic-secret" }) })));
    await findElement(clientTree(), n => n.props["aria-label"] === "Copy Alpha production key").props.onClick();
    expect(hookHarness.copiedValues.at(-1)).toBe("synthetic-secret");
    expect(notices).toEqual([["success", "API key copied."]]);
  });
  it("announces one-time issued-key copy success", async () => {
    hookHarness.states[4] = "synthetic-secret";
    await findElement(clientTree(), n => n.type === Button && n.props.icon === "content_copy" && String(n.props.onClick).includes("created_key")).props.onClick();
    expect(notices).toEqual([["success", "Copied to clipboard."]]);
  });
  it("uses the incumbent polite live toast region", () => {
    expect(readFileSync(new URL("../../src/shared/components/layouts/DashboardLayout.js", import.meta.url), "utf8")).toContain('aria-live="polite"');
  });
});
