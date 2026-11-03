import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

function load(relativePath, extraShims = {}) {
  const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  const code = transformSync(source, {
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const mod = { exports: {} };
  const requireShim = (id) => {
    if (id === "react") return React;
    if (id === "@/shared/utils/cn") {
      return { cn: (...parts) => parts.filter(Boolean).join(" ") };
    }
    if (id === "./Icon") return { default: () => null };
    if (extraShims[id]) return extraShims[id];
    throw new Error(`unexpected import: ${id}`);
  };
  new Function("require", "module", "exports", "React", code)(
    requireShim,
    mod,
    mod.exports,
    React
  );
  return mod.exports.default;
}

describe("Toggle accessible name", () => {
  const Toggle = load("src/shared/components/Toggle.js");

  const nameOf = (markup) => {
    const match = markup.match(/role="switch"[^>]*aria-label="([^"]+)"/);
    return match ? match[1] : null;
  };

  it("uses an explicit ariaLabel", () => {
    expect(nameOf(renderToStaticMarkup(React.createElement(Toggle, { checked: true, ariaLabel: "Round-robin provider strategy" }))))
      .toBe("Round-robin provider strategy");
  });

  it("falls back to a visible label", () => {
    expect(nameOf(renderToStaticMarkup(React.createElement(Toggle, { checked: true, label: "Auto-refresh" }))))
      .toBe("Auto-refresh");
  });

  it("uses the title prop used by icon-only rows", () => {
    expect(nameOf(renderToStaticMarkup(React.createElement(Toggle, { checked: true, title: "Disable connection" }))))
      .toBe("Disable connection");
  });

  it("never renders an unnamed switch", () => {
    expect(nameOf(renderToStaticMarkup(React.createElement(Toggle, { checked: false })))).toBe("Toggle");
  });
});

describe("Input label association", () => {
  const Input = load("src/shared/components/Input.js");

  it("links the visible label to the input id", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Input, { label: "Body cap (bytes)", type: "number", value: 262144, onChange: () => {} })
    );
    const labelFor = markup.match(/<label for="([^"]+)"/)?.[1];
    const inputId = markup.match(/<input id="([^"]+)"/)?.[1];
    expect(labelFor).toBeTruthy();
    expect(inputId).toBe(labelFor);
  });

  it("keeps a caller-supplied id", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Input, { id: "custom-cap", label: "Cap", value: 1, onChange: () => {} })
    );
    expect(markup).toContain('for="custom-cap"');
    expect(markup).toContain('id="custom-cap"');
  });
});
