import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { beforeEach, describe, expect, it } from "vitest";
import * as skillsConstants from "../../src/shared/constants/skills.js";

const hookHarness = {
  cursor: 0,
  states: [],
  copiedValues: [],
};

const testReact = {
  ...React,
  useMemo: (factory) => factory(),
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

const sourcePath = new URL("../../src/app/(dashboard)/dashboard/skills/page.js", import.meta.url);
const compiledPage = transformSync(readFileSync(sourcePath, "utf8"), {
  filename: sourcePath.pathname,
  presets: [[presetReact, { runtime: "classic" }]],
  plugins: [transformModulesCommonjs],
}).code;

const moduleMocks = {
  react: testReact,
  "@/shared/components/Icon": {
    __esModule: true,
    default: ({ name }) => React.createElement("span", { "data-icon": name }),
  },
  "@/shared/components/overlays": {
    PopoverMenu: ({ open, label, children }) => open
      ? React.createElement("div", { role: "menu", "aria-label": label }, children)
      : null,
  },
  "@/shared/hooks/useCopyToClipboard": {
    useCopyToClipboard: () => ({
      copied: false,
      copy: (value) => hookHarness.copiedValues.push(value),
    }),
  },
  "@/shared/constants/skills": skillsConstants,
};

const pageModule = { exports: {} };
new Function("require", "module", "exports", "React", compiledPage)(
  (specifier) => {
    if (!(specifier in moduleMocks)) throw new Error(`Unexpected page import: ${specifier}`);
    return moduleMocks[specifier];
  },
  pageModule,
  pageModule.exports,
  testReact,
);
const SkillsPage = pageModule.exports.default;

function resetCursor() {
  hookHarness.cursor = 0;
}

function renderPage() {
  resetCursor();
  return renderToStaticMarkup(React.createElement(SkillsPage));
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

function pageTree() {
  resetCursor();
  return SkillsPage();
}

describe("skills dashboard surface", () => {
  beforeEach(() => {
    hookHarness.cursor = 0;
    hookHarness.states = [];
    hookHarness.copiedValues = [];
  });

  it("renders the synchronous catalog without loading or error states", () => {
    const html = renderPage();

    expect(html).toContain(">Skills</h1>");
    expect(html).toContain("using-krouter9");
    expect(html).toContain(`${skillsConstants.SKILLS.length} results`);
    expect(html).toContain("KRouter9 (Entry)");
    expect(html).toContain("View repository");
    expect(html).not.toMatch(/loading|failed to load|something went wrong/i);
  });

  it("filters the catalog from the search control", () => {
    const input = findElement(pageTree(), (node) => node.type === "input" && node.props.id === "skill-search");
    input.props.onChange({ target: { value: "Text-to-Speech" } });

    const html = renderPage();
    expect(html).toContain("1 results");
    expect(html).toContain("Text-to-Speech");
    expect(html).not.toContain("Image Generation");
    expect(html).toContain("Clear search");
  });

  it("shows the implemented empty state and clears the search", () => {
    const input = findElement(pageTree(), (node) => node.type === "input" && node.props.id === "skill-search");
    input.props.onChange({ target: { value: "no-such-skill-9f41" } });

    expect(renderPage()).toContain("No skills match this search.");

    const clearButton = findElement(
      pageTree(),
      (node) => node.type === "button" && node.props.children === "Clear search",
    );
    clearButton.props.onClick();
    const restored = renderPage();
    expect(restored).toContain(`${skillsConstants.SKILLS.length} results`);
    expect(restored).not.toContain("No skills match this search.");
  });

  it("copies the installation prompt through the shared clipboard behavior", () => {
    const copyComponent = findElement(
      pageTree(),
      (node) => typeof node.type === "function" && node.props.label === "Copy prompt",
    );
    const button = copyComponent.type(copyComponent.props);
    button.props.onClick();

    expect(hookHarness.copiedValues).toHaveLength(1);
    expect(hookHarness.copiedValues[0]).toMatch(/^Read this skill and use it: https:\/\//);
    expect(hookHarness.copiedValues[0]).toContain("krouter9/SKILL.md");
  });
});
