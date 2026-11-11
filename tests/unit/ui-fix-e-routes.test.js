// Wave E (ui-fix plan): routes and nav — F4, F5, F8, F9, F10, F12 (+ F13 on settings/pricing).
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_METHODS, MEDIA_PROVIDER_KINDS } from "../../src/shared/constants/providers.js";

const root = new URL("../../", import.meta.url);
const dashboard = "src/app/(dashboard)/dashboard/";

// Stubbed-React harness (same style as wave-d-ui.test.js): renders one component
// function, records effects, keeps state between renders.
function harness(file, { exportNames = [], mocks = {}, strict = false } = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  let cursor = 0;
  let refCursor = 0;
  const testReact = {
    ...React,
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => refs[refCursor++] ||= { current: value },
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
  };
  let source = readFileSync(new URL(file, root), "utf8");
  if (exportNames.length) source += `\nexport { ${exportNames.join(", ")} };`;
  const code = transformSync(source, {
    filename: file,
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const mod = { exports: {} };
  const passthrough = ({ children }) => children ?? null;
  const stubModule = new Proxy({ __esModule: true, default: passthrough }, { get: (object, key) => object[key] || passthrough });
  new Function("require", "module", "exports", "React", code)((name) => {
    if (name === "react") return testReact;
    if (name in mocks) return { __esModule: true, ...mocks[name] };
    if (strict) throw new Error(`unmocked ${name}`);
    return stubModule;
  }, mod, mod.exports, testReact);
  return {
    states, effects, exports: mod.exports,
    render: (props = {}, name = "default") => { cursor = 0; refCursor = 0; effects.length = 0; return mod.exports[name](props); },
    runEffects: () => [...effects].forEach((effect) => effect()),
  };
}
function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((child) => all(child, predicate))];
}
const find = (node, predicate) => all(node, predicate)[0];
const text = (node) => typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join(" ")
    : node && typeof node === "object" ? React.Children.toArray(node.props?.children).map(text).join(" ") : "";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const cn = (...values) => values.filter(Boolean).join(" ");

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------- F4
describe("F4 providers/new auth methods", () => {
  const FAKE_PROVIDERS = {
    "fake-key": { id: "fake-key", name: "Fake Key Co" },
    "fake-oauth": { id: "fake-oauth", name: "Fake OAuth Co" },
  };
  function page() {
    const LoadFailedState = () => null;
    const Input = () => null;
    const Select = () => null;
    const h = harness(`${dashboard}providers/new/page.js`, {
      mocks: {
        "@/shared/constants/config": {
          AI_PROVIDERS: FAKE_PROVIDERS,
          AUTH_METHODS,
          OAUTH_PROVIDERS: { "fake-oauth": FAKE_PROVIDERS["fake-oauth"] },
          APIKEY_PROVIDERS: { "fake-key": FAKE_PROVIDERS["fake-key"] },
          WEB_COOKIE_PROVIDERS: {},
        },
        "@/shared/components": { Input, Select, Card: Object.assign(({ children }) => children, { Section: ({ children }) => children }), Button: ({ children }) => children, Toggle: () => null },
        "@/shared/components/LoadFailedState": { default: LoadFailedState },
        "next/navigation": { useRouter: () => ({ push: vi.fn() }) },
      },
    });
    return { h, Input, Select };
  }
  const authButtons = (tree) => all(tree, (n) => n.type === "button" && "aria-pressed" in (n.props || {}));

  it("every AUTH_METHODS entry has a non-empty name", () => {
    for (const method of Object.values(AUTH_METHODS)) {
      expect(typeof method.name, `AUTH_METHODS.${method.id}.name`).toBe("string");
      expect(method.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("renders labelled auth buttons with aria-pressed whose text equals the constant names", () => {
    const { h } = page();
    const buttons = authButtons(h.render());
    expect(buttons.length).toBe(Object.keys(AUTH_METHODS).length);
    const names = buttons.map((button) => text(button).trim());
    expect(names.sort()).toEqual(Object.values(AUTH_METHODS).map((m) => m.name).sort());
    expect(buttons.filter((button) => button.props["aria-pressed"] === true)).toHaveLength(1);
  });

  it("default API-key method renders the API Key input, and the provider select is labelled", () => {
    const { h, Input, Select } = page();
    const tree = h.render();
    const pressed = authButtons(tree).find((button) => button.props["aria-pressed"] === true);
    expect(text(pressed).trim()).toBe(AUTH_METHODS.apikey.name);
    const apiKey = find(tree, (n) => n.type === Input && n.props.label === "API Key");
    expect(apiKey, "API Key input").toBeTruthy();
    expect(apiKey.props.type).toBe("password");
    const select = find(tree, (n) => n.type === Select);
    expect(select.props["aria-label"]).toBe("Provider");
  });

  it("selecting OAuth renders the OAuth section and hides the API Key input", () => {
    const { h, Input } = page();
    const oauth = authButtons(h.render()).find((button) => text(button).trim() === AUTH_METHODS.oauth.name);
    oauth.props.onClick();
    const tree = h.render();
    expect(find(tree, (n) => n.type === Input && n.props.label === "API Key")).toBeFalsy();
    expect(find(tree, (n) => n.props?.["data-testid"] === "oauth-section"), "OAuth section").toBeTruthy();
    expect(authButtons(tree).find((button) => button.props["aria-pressed"] === true) && text(authButtons(tree).find((b) => b.props["aria-pressed"] === true)).trim()).toBe(AUTH_METHODS.oauth.name);
  });

  it("selecting an OAuth-only provider switches the method off API key", () => {
    const { h, Select } = page();
    find(h.render(), (n) => n.type === Select).props.onChange({ target: { value: "fake-oauth" } });
    const tree = h.render();
    const pressed = authButtons(tree).find((button) => button.props["aria-pressed"] === true);
    expect(text(pressed).trim()).toBe(AUTH_METHODS.oauth.name);
    expect(authButtons(tree).map((b) => text(b).trim())).not.toContain(AUTH_METHODS.apikey.name);
  });

  it("submits the API-key payload the existing POST route expects", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const { h, Input, Select } = page();
    find(h.render(), (n) => n.type === Select).props.onChange({ target: { value: "fake-key" } });
    find(h.render(), (n) => n.type === Input && n.props.label === "API Key").props.onChange({ target: { value: "sk-test-FAKE" } });
    const form = find(h.render(), (n) => n.type === "form");
    await form.props.onSubmit({ preventDefault: () => {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/providers");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ provider: "fake-key", apiKey: "sk-test-FAKE" });
    expect(body).not.toHaveProperty("authMethod");
  });
});

// ---------------------------------------------------------------- F8 + F13
describe("F8 settings/pricing lives inside the dashboard shell", () => {
  const moved = `${dashboard}settings/pricing/page.js`;
  it("the page moved into the (dashboard) route group (URL unchanged)", () => {
    expect(existsSync(new URL(moved, root))).toBe(true);
    expect(existsSync(new URL("src/app/dashboard/settings/pricing/page.js", root))).toBe(false);
  });
  it("no primary button pairs bg-primary with text-white (F13)", () => {
    const source = readFileSync(new URL(moved, root), "utf8");
    const classStrings = source.match(/className="[^"]*"/g) || [];
    for (const cls of classStrings) {
      if (/bg-primary(?![/\w-])|bg-\[var\(--color-primary\)\]/.test(cls)) {
        expect(cls).not.toMatch(/text-white/);
        expect(cls).toMatch(/--color-on-primary/);
      }
    }
  });
  it("a /api/pricing failure renders LoadFailedState with a working Retry", async () => {
    const LoadFailedState = () => null;
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("console", { ...console, error: () => {} });
    const h = harness(moved, { mocks: {
      "@/shared/components/LoadFailedState": { default: LoadFailedState },
      "next/navigation": { useRouter: () => ({ push: vi.fn() }) },
    } });
    h.render();
    h.runEffects();
    await flush();
    const tree = h.render();
    const alert = find(tree, (n) => n.type === LoadFailedState);
    expect(alert, "LoadFailedState").toBeTruthy();
    expect(text(tree)).not.toMatch(/No pricing data available/);
    alert.props.onRetry();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- F9
describe("F9 media kinds and sidebar active zone", () => {
  function sidebar(pathname) {
    return harness("src/shared/components/Sidebar.js", {
      exportNames: ["ZONES", "isDestinationActive"],
      mocks: {
        "next/navigation": { usePathname: () => pathname },
        "@/shared/utils/cn": { cn },
        "@/shared/constants/config": { APP_CONFIG: { name: "KRouter9", version: "0.0.0" }, UPDATER_CONFIG: {} },
      },
    });
  }
  const currentZone = (tree) => all(tree, (n) => n.type === "button" && n.props?.["aria-current"] === "page").map((n) => text(n).trim());

  it("Media sits in the Operate zone and stays active on every media-providers path", () => {
    const { exports } = sidebar("/dashboard");
    const operate = exports.ZONES.find((zone) => zone.id === "operate");
    const media = operate.items.find(([, label]) => label === "Media");
    expect(media, "Media in operate").toBeTruthy();
    for (const zone of exports.ZONES.filter((z) => z.id !== "operate")) {
      expect(zone.items.some(([, label]) => label === "Media")).toBe(false);
    }
    for (const path of ["/dashboard/media-providers/tts", "/dashboard/media-providers/web", "/dashboard/media-providers/combo/abc", "/dashboard/media-providers/image/openai"]) {
      expect(exports.isDestinationActive(path, media[0]), path).toBe(true);
    }
  });

  it.each([
    ["/dashboard/media-providers/tts", "Operate"],
    ["/dashboard/mitm", "System"],
    ["/dashboard/pxpipe", "Observe"],
  ])("%s marks the %s zone current", (pathname, label) => {
    const h = sidebar(pathname);
    expect(currentZone(h.render())).toEqual([label]);
  });

  it("the media hub switcher links every MEDIA_PROVIDER_KINDS kind and marks the current one", () => {
    const h = harness("src/shared/components/MediaKindSwitcher.js", {
      mocks: {
        "next/navigation": { usePathname: () => "/dashboard/media-providers/tts" },
        "@/shared/constants/providers": { MEDIA_PROVIDER_KINDS },
        "@/shared/utils/cn": { cn },
      },
    });
    const tree = h.render();
    expect(tree?.props?.["aria-label"]).toBe("Media kinds");
    const links = all(tree, (n) => typeof n.props?.href === "string");
    for (const kind of MEDIA_PROVIDER_KINDS) {
      const target = kind.id === "webSearch" || kind.id === "webFetch" ? "/dashboard/media-providers/web" : `/dashboard/media-providers/${kind.id}`;
      expect(links.some((link) => link.props.href === target), kind.id).toBe(true);
    }
    const current = links.filter((link) => link.props["aria-current"] === "page");
    expect(current.map((link) => link.props.href)).toEqual(["/dashboard/media-providers/tts"]);
  });

  it("the media-providers layout renders the switcher above the page", () => {
    const file = `${dashboard}media-providers/layout.js`;
    expect(existsSync(new URL(file, root))).toBe(true);
    const MediaKindSwitcher = () => null;
    const h = harness(file, { mocks: { "@/shared/components/MediaKindSwitcher": { default: MediaKindSwitcher } } });
    const tree = h.render({ children: "PAGE" });
    expect(find(tree, (n) => n.type === MediaKindSwitcher)).toBeTruthy();
    expect(text(tree)).toContain("PAGE");
  });
});

// ---------------------------------------------------------------- F10
describe("F10 media combo breadcrumb", () => {
  const UUID = "0b6f3c1e-8a2d-4f7b-9c1a-2e3d4f5a6b7c";
  function header(pathname) {
    return harness("src/shared/components/Header.js", {
      exportNames: ["getPageInfo"],
      mocks: {
        "next/navigation": { usePathname: () => pathname },
        "@/shared/constants/config": { APP_CONFIG: { version: "0.0.0" }, OAUTH_PROVIDERS: {}, APIKEY_PROVIDERS: {} },
        "@/shared/constants/providers": { MEDIA_PROVIDER_KINDS, AI_PROVIDERS: {} },
        "@/shared/utils/providerIcon": { getProviderIconSrc: () => "" },
        "@/i18n/runtime": { translate: (value) => value },
        "@/store/headerSearchStore": { useHeaderSearchStore: () => undefined },
      },
    });
  }

  it("getPageInfo never yields a 404 crumb or the UUID for a combo path", () => {
    const info = header("/").exports.getPageInfo(`/dashboard/media-providers/combo/${UUID}`);
    expect(info.breadcrumbs.some((crumb) => crumb.href === "/dashboard/media-providers/combo")).toBe(false);
    // Rendered fields only; comboId is the internal lookup key for the name fetch.
    expect(JSON.stringify({ title: info.title, description: info.description, breadcrumbs: info.breadcrumbs })).not.toContain(UUID);
    expect(info.breadcrumbs[0]).toMatchObject({ label: "Media", href: "/dashboard/media-providers/web" });
    expect(info.title).toBe("Media combo");
  });

  it("the header shows the combo name once loaded, never the UUID, and the crumb truncates", async () => {
    const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => (String(url).includes("/api/combos/") ? { id: UUID, name: "voice-chain" } : {}) }));
    vi.stubGlobal("fetch", fetchMock);
    const h = header(`/dashboard/media-providers/combo/${UUID}`);
    let markup = renderToStaticMarkup(h.render());
    expect(markup).not.toContain(UUID);
    h.runEffects();
    await flush();
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/combos/${UUID}`)).toBe(true);
    const tree = h.render();
    markup = renderToStaticMarkup(tree);
    expect(markup).toContain("voice-chain");
    expect(markup).not.toContain(UUID);
    expect(markup).not.toContain('href="/dashboard/media-providers/combo"');
    const current = find(tree, (n) => n.type === "h1" && text(n).includes("voice-chain"));
    expect(current.props.className).toMatch(/truncate/);
    expect(current.props.title).toBe("voice-chain");
  });
});

// ---------------------------------------------------------------- F5
describe("F5 basic-chat hydration", () => {
  const STORE = {
    "basicChat.sessions": JSON.stringify([{ id: "s1", title: "Saved", updatedAt: "2026-11-01T00:00:00Z", messages: [] }]),
    "basicChat.activeSessionId": "s1",
    "basicChat.activeProviderId": "openai",
    "basicChat.draft": "hello",
  };
  function chat() {
    return harness(`${dashboard}basic-chat/BasicChatPageClient.js`);
  }
  function seedStorage() {
    const store = {};
    const source = readFileSync(new URL(`${dashboard}basic-chat/BasicChatPageClient.js`, root), "utf8");
    const keys = Object.fromEntries([...source.matchAll(/(\w+):\s*"([^"]+)"/g)].filter(([, k]) => ["sessions", "activeSessionId", "activeProviderId", "draft"].includes(k)).map(([, k, v]) => [k, v]));
    store[keys.sessions] = STORE["basicChat.sessions"];
    store[keys.activeSessionId] = "s1";
    store[keys.activeProviderId] = "openai";
    store[keys.draft] = "hello";
    const localStorage = { getItem: vi.fn((k) => (k in store ? store[k] : null)), setItem: vi.fn((k, v) => { store[k] = String(v); }), removeItem: vi.fn() };
    return { store, localStorage, keys };
  }

  it("the first client render equals the SSR render even with storage seeded", () => {
    // SSR: no window.
    const ssr = chat();
    ssr.render();
    const ssrState = ssr.states.slice(0, 12);
    // Client: window + seeded storage.
    const { localStorage } = seedStorage();
    vi.stubGlobal("window", { localStorage, matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal("localStorage", localStorage);
    const client = chat();
    client.render();
    expect(client.states.slice(0, 12)).toEqual(ssrState);
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });

  it("sessions, active ids and draft load from storage after mount, without being overwritten", () => {
    const { localStorage, store, keys } = seedStorage();
    vi.stubGlobal("window", { localStorage, matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("document", { addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const h = chat();
    h.render();
    // Run only the first effect pass (mount), then re-render as React would.
    h.runEffects();
    h.render();
    h.runEffects();
    const flat = JSON.stringify(h.states);
    expect(flat).toContain("Saved");
    expect(h.states).toContain("hello");
    expect(h.states).toContain("s1");
    expect(JSON.parse(store[keys.sessions])[0].title).toBe("Saved");
    expect(store[keys.draft]).toBe("hello");
  });
});

// ---------------------------------------------------------------- F12
describe("F12 quota mobile rows", () => {
  const path = `${dashboard}usage/components/ProviderLimits/index.js`;
  async function rows(quotaEntry) {
    const utils = await import("../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js");
    const Stub = ({ children }) => React.createElement("div", null, children);
    const h = harness(path, {
      strict: true,
      mocks: {
        "./utils": utils, "./QuotaTable": { default: () => React.createElement("div", null, "Quota detail table") },
        "@/shared/components/Icon": { default: () => null }, "@/shared/components/ProviderIcon": { default: () => null },
        "@/shared/components/Toggle": { default: () => null }, "@/shared/components/Tooltip": { default: Stub }, "@/shared/components/Card": { default: Stub },
        "@/shared/components": { ConfirmModal: () => null, EditConnectionModal: () => null },
        "@/shared/constants/providers": { USAGE_SUPPORTED_PROVIDERS: ["codex"], AI_PROVIDERS: { codex: { id: "codex", name: "OpenAI Codex" } } },
        "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copy: vi.fn() }) },
        "@/shared/utils/errorClass": { normalizeErrorClass: () => "unknown", errorClassLabel: () => "Unknown" },
      },
    });
    h.render();
    h.states[0] = [{ id: "c1", provider: "codex", name: "work-account-with-a-long-readable-name" }];
    h.states[1] = { c1: quotaEntry };
    const totalIndex = h.states.findIndex((v) => v?.eligibleConnections === 0);
    h.states[totalIndex] = { eligibleConnections: 1, providerFilteredConnections: 1 };
    return h.render();
  }

  it("the provider name shows the display name, wraps instead of truncating, and keeps a title", async () => {
    const tree = await rows({ quotas: [{ name: "Weekly", used: 1, total: 20 }] });
    const heading = find(tree, (n) => n.type === "h3");
    expect(text(heading).trim()).toBe("OpenAI Codex");
    expect(heading.props.className).not.toMatch(/\btruncate\b/);
    expect(heading.props.className).toMatch(/break-words|\[overflow-wrap:anywhere\]/);
    expect(heading.props.title).toBe("OpenAI Codex");
    const account = find(tree, (n) => n.type === "p" && text(n).includes("work-account"));
    expect(account.props.className).not.toMatch(/\btruncate\b/);
    expect(account.props.title).toBeTruthy();
  });

  it("an auth-failed message renders exactly once", async () => {
    const message = "Auth failed: token expired";
    const markup = renderToStaticMarkup(await rows({ quotas: [], message }));
    // Visible text only: a title attribute repeating it is not a duplicate on screen.
    const visible = markup.replace(/<[^>]*>/g, "\n");
    expect(visible.split(message).length - 1).toBe(1);
  });
});
