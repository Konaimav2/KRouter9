import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import commonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { expect, it } from "vitest";
it("allows docs branding and header actions to reflow on 390px screens", () => {
  const mod = { exports: {} };
  const code = transformSync(readFileSync(new URL("../../src/app/docs/page.js", import.meta.url), "utf8"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [commonjs] }).code;
  new Function("require", "module", "exports", "React", code)(() => ({ __esModule: true, default: () => null }), mod, mod.exports, React);
  const page = mod.exports.default();
  const header = React.Children.toArray(page.props.children).find(n => n.type === "header");
  const row = header.props.children;
  expect(row.props.className).toContain("flex-wrap");
  const nav = React.Children.toArray(row.props.children).find(n => n.type === "nav");
  expect(nav.props.className).toContain("w-full");
  expect(nav.props.className).toContain("sm:w-auto");
});
