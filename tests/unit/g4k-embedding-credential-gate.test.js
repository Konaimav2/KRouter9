import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";

// Wave G4K — Embedding explicit-credential gate (TDD RED first).
//
// Residual: settled-empty key list + empty manual field still enables
// Run/Copy (Run POSTs without Authorization; Copy emits Bearer YOUR_KEY).
// This file renders the ACTUAL consumer with a settled-empty list and an
// empty manual field (behavioral fixture) and requires: Run + Copy blocked,
// a visible hint, and in-handler guards (not just disabled attrs).

const copiedTexts = [];
const embedCalls = [];

function compileCard(mocks) {
  const path = new URL(
    "../../src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js",
    import.meta.url
  );
  const { code } = transformSync(readFileSync(path, "utf8"), {
    filename: path.pathname,
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  });
  const loaded = { exports: {} };
  const req = (id) => {
    if (!(id in mocks)) throw new Error(`Unexpected import ${id}`);
    return mocks[id];
  };
  new Function("require", "module", "exports", "React", code)(
    req,
    loaded,
    loaded.exports,
    React
  );
  return loaded.exports;
}

function makeHooks() {
  const states = [];
  const refs = [];
  const effects = [];
  let cursor = 0;
  let refCursor = 0;
  const react = {
    ...React,
    useState(value) {
      const i = cursor++;
      if (!(i in states))
        states[i] = typeof value === "function" ? value() : value;
      return [
        states[i],
        (next) => {
          states[i] = typeof next === "function" ? next(states[i]) : next;
        },
      ];
    },
    useRef(value) {
      const i = refCursor++;
      return (refs[i] ||= { current: value });
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => effects.push(fn),
  };
  return {
    react,
    states,
    effects,
    render(fn, props) {
      cursor = refCursor = 0;
      effects.length = 0;
      return fn(props);
    },
  };
}

function allNodes(tree, pred) {
  if (!tree || typeof tree !== "object") return [];
  const kids = React.Children.toArray(tree.props?.children);
  return [
    ...(pred(tree) ? [tree] : []),
    ...kids.flatMap((c) => allNodes(c, pred)),
  ];
}

const textOf = (node) =>
  React.Children.toArray(node.props?.children)
    .map((c) =>
      typeof c === "string" ? c : typeof c === "number" ? String(c) : ""
    )
    .join(" ");

// Settled-empty fixture: GET /api/keys returns ok + zero keys; tunnel empty;
// embeddings POST recorded but never expected to fire while blocked.
function stubSettledEmpty() {
  vi.stubGlobal("window", { location: { origin: "http://local" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).includes("/api/v1/embeddings")) {
        embedCalls.push(url);
        return {
          ok: true,
          status: 200,
          async json() {
            return { data: [] };
          },
        };
      }
      if (String(url).includes("/api/tunnel/status")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {};
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { keys: [] };
        },
      };
    })
  );
}

async function renderSettledEmpty() {
  const masked = await import("@/lib/maskedKeyClient.js");
  const h = makeHooks();
  const { EmbeddingExampleCard } = compileCard({
    react: h.react,
    "@/shared/components/Icon": { __esModule: true, default: () => null },
    "@/shared/components": {
      __esModule: true,
      Card: ({ children }) => React.createElement("section", null, children),
    },
    "@/shared/constants/providers": {
      __esModule: true,
      getProviderAlias: (id) => id,
      isCustomEmbeddingProvider: () => false,
    },
    "@/shared/constants/models": {
      __esModule: true,
      getModelsByProviderId: () => [{ id: "emb-1", name: "Emb 1" }],
      getModelKind: () => "embedding",
    },
    "@/shared/hooks/useCopyToClipboard": {
      __esModule: true,
      useCopyToClipboard: () => ({
        copied: null,
        copy: (t) => {
          copiedTexts.push(t);
        },
      }),
    },
    "@/lib/maskedKeyClient": masked,
    "./exampleShared": {
      __esModule: true,
      Row: ({ children, label }) =>
        React.createElement("div", { "data-label": label }, children),
    },
  });
  h.render(EmbeddingExampleCard, { providerId: "p" });
  const fx = h.effects[0];
  await fx();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const tree = h.render(EmbeddingExampleCard, { providerId: "p" });
  // Sanity: the fixture really is settled-empty with an empty manual field.
  expect(h.states[4]).toEqual([]); // maskedKeys
  expect(h.states[7]).toBe(false); // keysLoading
  expect(h.states[3]).toBe(""); // apiKey (manual field untouched)
  const buttons = allNodes(tree, (n) => n.type === "button");
  const run = buttons.find((b) => textOf(b).includes("Run"));
  const copy = buttons.find((b) => textOf(b).includes("Copy"));
  expect(run).toBeTruthy();
  expect(copy).toBeTruthy();
  return { tree, run, copy };
}

beforeEach(() => {
  copiedTexts.length = 0;
  embedCalls.length = 0;
  stubSettledEmpty();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("G4K RED: settled-empty list + empty manual field blocks Run/Copy", () => {
  it("Run is disabled", async () => {
    const { run } = await renderSettledEmpty();
    expect(run.props.disabled).toBe(true);
  });

  it("Copy is disabled", async () => {
    const { copy } = await renderSettledEmpty();
    expect(copy.props.disabled).toBe(true);
  });

  it("a visible hint asks for an explicit credential", async () => {
    const { tree } = await renderSettledEmpty();
    expect(renderToStaticMarkup(tree)).toMatch(/enter an api key/i);
  });

  it("Run handler refuses to POST without a credential (guard inside handler)", async () => {
    const { run } = await renderSettledEmpty();
    await run.props.onClick();
    expect(embedCalls).toHaveLength(0);
  });

  it("Copy handler emits nothing without a credential (no Bearer YOUR_KEY)", async () => {
    const { copy } = await renderSettledEmpty();
    copy.props.onClick();
    expect(copiedTexts).toHaveLength(0);
    expect(copiedTexts.join("\n")).not.toContain("Bearer YOUR_KEY");
  });
});
