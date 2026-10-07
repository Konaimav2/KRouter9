import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usageRoot = "../../src/app/(dashboard)/dashboard/usage/";

function compile(relativePath, mocks, reactModule = React) {
  const sourcePath = new URL(`${usageRoot}${relativePath}`, import.meta.url);
  const compiled = transformSync(readFileSync(sourcePath, "utf8"), {
    filename: sourcePath.pathname,
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "React", compiled)(
    (specifier) => {
      if (!(specifier in mocks)) throw new Error(`Unexpected usage import: ${specifier}`);
      return mocks[specifier];
    },
    loaded,
    loaded.exports,
    React,
  );
  return loaded.exports;
}

function hookReact(initialValues = []) {
  let stateIndex = 0;
  return {
    ...React,
    useCallback: (callback) => callback,
    useEffect: () => undefined,
    useMemo: (factory) => factory(),
    useRef: (current) => ({ current }),
    useState: (initial) => {
      const index = stateIndex++;
      const value = index < initialValues.length
        ? initialValues[index]
        : typeof initial === "function" ? initial() : initial;
      return [value, vi.fn()];
    },
  };
}

const router = { push: vi.fn(), replace: vi.fn() };
let query = new URLSearchParams();
const navigation = {
  useRouter: () => router,
  useSearchParams: () => query,
};

beforeEach(() => {
  query = new URLSearchParams();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("usage page surfaces", () => {
  function renderPage(search = "") {
    query = new URLSearchParams(search);
    const SegmentedControl = ({ options, value, onChange }) => React.createElement(
      "div",
      { "data-control": options.map((option) => option.label).join("/"), "data-value": value },
      options.map((option) => React.createElement("button", { key: option.value, onClick: () => onChange(option.value) }, option.label)),
    );
    const marker = (name) => {
      function SurfaceMarker(props) {
        return React.createElement("section", { "data-surface": name, "data-period": props.period, "data-mode": props.mode }, name);
      }
      return SurfaceMarker;
    };
    const { default: UsagePage } = compile("page.js", {
      react: React,
      "next/navigation": navigation,
      "@/shared/components": { SegmentedControl },
      "./components/UsageDashboard": { __esModule: true, default: marker("overview") },
      "./components/UsageLogs": { __esModule: true, default: marker("logs") },
      "./components/RequestDetailsTab": { __esModule: true, default: marker("details") },
      "./components/PerKeyUsageSection": { __esModule: true, default: marker("keys") },
    });
    return renderToStaticMarkup(React.createElement(UsagePage));
  }

  it.each([
    ["tab=overview", "overview"],
    ["tab=logs", "logs"],
    ["tab=keys", "keys"],
  ])("renders the %s usage client", (search, surface) => {
    expect(renderPage(search)).toContain(`data-surface="${surface}"`);
  });

  it("uses one URL-derived Costs/Tokens state and keeps the Overview free of a key picker", () => {
    const html = renderPage("tab=overview&mode=tokens&period=7d");

    expect(html.match(/data-control="Costs\/Tokens"/g)).toHaveLength(1);
    expect(html).toContain('data-control="Costs/Tokens" data-value="tokens"');
    expect(html).toContain('data-surface="overview" data-period="7d" data-mode="tokens"');
    expect(html).not.toContain("Choose API key");
    expect(html).not.toContain("Search API keys");
  });
});

describe("usage overview behavior", () => {
  it("persists table sorting in the URL", () => {
    query = new URLSearchParams("tab=overview&sortBy=rawModel&sortOrder=asc");
    const stats = { byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {}, pending: {}, activeRequests: [], recentRequests: [] };
    const fakeReact = hookReact(["model", stats, [], false, false, "", false]);
    let tableProps;
    const UsageTable = (props) => { tableProps = props; return React.createElement("div", null, "usage table"); };
    const { default: UsageDashboard } = compile("components/UsageDashboard.js", {
      react: fakeReact,
      "next/link": ({ children }) => React.createElement("a", null, children),
      "next/navigation": navigation,
      "@/shared/components/Badge": ({ children }) => React.createElement("span", null, children),
      "lucide-react": { CircleCheck: () => null, CircleX: () => null },
      "@/shared/constants/providers": { AI_PROVIDERS: {}, FREE_PROVIDERS: {} },
      "./OverviewCards": { __esModule: true, default: () => React.createElement("div", null, "cards") },
      "./UsageChart": { __esModule: true, default: () => React.createElement("div", null, "chart") },
      "./UsageTable": { __esModule: true, default: UsageTable, fmt: String, fmtTime: String },
      "next/dynamic": { __esModule: true, default: () => () => React.createElement("div", null, "topology") },
    }, fakeReact);

    renderToStaticMarkup(UsageDashboard({ period: "today", mode: "costs" }));
    tableProps.onToggleSort("model", "rawModel");

    expect(router.replace).toHaveBeenCalledWith(
      "?tab=overview&sortBy=rawModel&sortOrder=desc&table=model",
      { scroll: false },
    );
  });

  it("renders request input green and output red", () => {
    query = new URLSearchParams();
    const stats = {
      byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {}, pending: {}, activeRequests: [],
      recentRequests: [{ timestamp: new Date().toISOString(), status: "OK", model: "model-a", provider: "provider-a", promptTokens: 12, completionTokens: 7 }],
    };
    const fakeReact = hookReact(["model", stats, [], false, false, "", false]);
    const { default: UsageDashboard } = compile("components/UsageDashboard.js", {
      react: fakeReact,
      "next/link": ({ children }) => React.createElement("a", null, children),
      "next/navigation": navigation,
      "@/shared/components/Badge": ({ children }) => React.createElement("span", null, children),
      "lucide-react": { CircleCheck: () => null, CircleX: () => null },
      "@/shared/constants/providers": { AI_PROVIDERS: {}, FREE_PROVIDERS: {} },
      "./OverviewCards": { __esModule: true, default: () => null },
      "./UsageChart": { __esModule: true, default: () => null },
      "./UsageTable": { __esModule: true, default: () => null, fmt: String, fmtTime: String },
      "next/dynamic": { __esModule: true, default: () => () => null },
    }, fakeReact);

    const html = renderToStaticMarkup(UsageDashboard({ period: "today", mode: "tokens" }));
    expect(html).toContain('class="text-[var(--success)]">← 12');
    expect(html).toContain('class="text-[var(--danger)]">7 →');
  });
});

describe("usage logs and per-key surfaces", () => {
  it("renders log columns with green input and red output", () => {
    const fakeReact = hookReact([["10:00 | model-a | provider-a | route | 12 | 7 | OK"], false, "", true, "", "all", "all"]);
    const { default: UsageLogs } = compile("components/UsageLogs.js", {
      react: fakeReact,
      "lucide-react": { CircleCheck: () => null, CircleDashed: () => null, CircleX: () => null },
      "@/shared/components/Toggle": () => null,
    }, fakeReact);
    const html = renderToStaticMarkup(UsageLogs());

    expect(html).toContain("Request logs");
    expect(html).toContain("Token In");
    expect(html).toContain("Token Out");
    expect(html).toContain('font-mono text-[var(--success)]">← 12');
    expect(html).toContain('font-mono text-[var(--danger)]">7 →');
  });

  it("renders the dedicated per-key section and its directional token metrics", () => {
    const row = { keyName: "Build key", apiKeyMasked: "kr_••••1234", requests: 3, promptTokens: 12, cachedTokens: 2, completionTokens: 7, cost: 0.25, series: [{ provider: "provider-a", model: "model-a", requests: 3, totalTokens: 19 }] };
    const fakeReact = hookReact([[row], "Build key", "", "provider", false, "", false]);
    const { default: PerKeyUsageSection } = compile("components/PerKeyUsageSection.js", {
      react: fakeReact,
      "./usageMeta.js": { aggregatePerKey: (value) => value },
    }, fakeReact);
    const html = renderToStaticMarkup(PerKeyUsageSection({ period: "7d" }));

    expect(html).toContain("Search API keys");
    expect(html).toContain("Build key");
    expect(html).toContain("Token In");
    expect(html).toContain("← 12");
    expect(html).toContain("Token Out");
    expect(html).toContain("7 →");
    expect(html).toContain("Manage key");
  });
});
