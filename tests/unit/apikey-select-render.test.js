import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

// FR-2 — render the real component. Source-string tests are not enough: this
// catches a missing hook import that only fails when the component executes.
const SOURCE = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/dashboard/cli-tools/components/ApiKeySelect.js"
  ),
  "utf8"
);

function loadComponent() {
  const code = transformSync(SOURCE, {
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const module = { exports: {} };
  const requireShim = (id) => {
    if (id === "react") return React;
    if (id.includes("shared/components/Icon")) return { default: () => null };
    if (id.includes("cliEndpointPresets")) {
      return {
        readKeyPresets: () => [],
        upsertKeyPreset: () => {},
        deleteKeyPreset: () => {},
        subscribeKeyPresets: () => () => {},
      };
    }
    throw new Error(`unexpected import: ${id}`);
  };
  new Function("require", "module", "exports", "React", code)(
    requireShim,
    module,
    module.exports,
    React
  );
  return module.exports.default;
}

describe("ApiKeySelect renders", () => {
  it("renders the placeholder state without throwing", () => {
    const Component = loadComponent();
    const html = renderToStaticMarkup(
      React.createElement(Component, {
        value: "",
        onChange: () => {},
        apiKeys: [{ id: "key-1", maskedKey: "sk-1•••c4d8" }],
      })
    );
    expect(html).toContain("Select a key");
    expect(html).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  });

  it("renders an empty-key callout and a selected custom value", () => {
    const Component = loadComponent();
    const empty = renderToStaticMarkup(
      React.createElement(Component, { value: "", onChange: () => {}, apiKeys: [], cloudEnabled: false })
    );
    expect(empty).toContain("sk_krouter9 (default)");

    const custom = renderToStaticMarkup(
      React.createElement(Component, {
        value: "sk-custom-value",
        onChange: () => {},
        apiKeys: [],
        cloudEnabled: true,
      })
    );
    expect(custom).toContain("Custom...");
  });
});
