import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
export function compile(file, mocks, extra = "") {
  const path = new URL(`../../src/app/(dashboard)/dashboard/usage/${file}`, import.meta.url);
  const { code } = transformSync(readFileSync(path, "utf8") + extra, { filename: path.pathname, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "React", code)((id) => { if (!(id in mocks)) throw new Error(`Unexpected import ${id}`); return mocks[id]; }, loaded, loaded.exports, React);
  return loaded.exports;
}
export function hooks(initial = []) {
  const states = [...initial], refs = [], effects = []; let cursor = 0, refCursor = 0;
  const react = { ...React, useState(value) { const i = cursor++; if (!(i in states)) states[i] = typeof value === "function" ? value() : value; return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; }, useRef(value) { const i = refCursor++; return refs[i] ||= { current: value }; }, useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn) };
  return { react, states, effects, render(fn, props) { cursor = refCursor = 0; effects.length = 0; return fn(props); } };
}
export function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap((child) => nodes(child, predicate))];
}
export const passthrough = ({ children }) => React.createElement("div", null, children);
export const propTypes = { __esModule: true, default: new Proxy({}, { get: () => Object.assign(() => ({}), { isRequired: {} }) }) };
export const marker = (name) => { const fn = () => null; fn.displayName = name; return fn; };
export const named = (name) => (node) => node.type?.displayName === name;
