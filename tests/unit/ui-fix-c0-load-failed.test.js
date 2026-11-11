// Wave C0 (ui-fix plan): shared LoadFailedState contract.
// A page load failure must be announced (role="alert"), offer a Retry with a
// 44x44 target, never leak a raw error stack, and never read like an empty or
// not-found state.
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it, vi } from "vitest";

const file = new URL("../../src/shared/components/LoadFailedState.js", import.meta.url);

function load() {
  // RED: the module does not exist yet, so this read throws ENOENT.
  const source = readFileSync(file, "utf8");
  const code = transformSync(source, {
    filename: "LoadFailedState.js",
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const mod = { exports: {} };
  const Stub = () => null;
  const stubModule = new Proxy({ __esModule: true, default: Stub }, { get: (o, k) => o[k] || Stub });
  new Function("require", "module", "exports", "React", code)(
    (name) => (name === "react" ? React : stubModule), mod, mod.exports, React,
  );
  return mod.exports.default;
}

function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props?.children).flatMap((child) => all(child, predicate)),
  ];
}
const find = (node, predicate) => all(node, predicate)[0];
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node)
  : node && typeof node === "object" ? React.Children.toArray(node.props?.children).map(text).join(" ") : "");
// Accessible name: aria-label wins, else the visible text content.
const accName = (node) => (node.props?.["aria-label"] || text(node)).replace(/\s+/g, " ").trim();

describe("Wave C0: LoadFailedState", () => {
  it("exists as a shared component", () => {
    expect(existsSync(file)).toBe(true);
  });

  it("renders role=alert containing the given message and title", () => {
    const LoadFailedState = load();
    const tree = LoadFailedState({ title: "Couldn't load proxy pools", message: "The server returned an error.", onRetry: () => {} });
    const alert = find(tree, (n) => n.props?.role === "alert");
    expect(alert).toBeTruthy();
    expect(text(alert)).toContain("The server returned an error.");
    expect(text(alert)).toContain("Couldn't load proxy pools");
  });

  it("has a Retry button named 'Retry' that calls onRetry exactly once per click", () => {
    const LoadFailedState = load();
    const onRetry = vi.fn();
    const tree = LoadFailedState({ title: "Load failed", message: "Try again.", onRetry });
    const buttons = all(tree, (n) => n.type === "button");
    expect(buttons).toHaveLength(1);
    const retry = buttons[0];
    expect(accName(retry)).toBe("Retry");
    expect(retry.props.type).toBe("button");
    retry.props.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("gives Retry a minimum 44x44 target", () => {
    const LoadFailedState = load();
    const tree = LoadFailedState({ title: "x", message: "y", onRetry: () => {} });
    const retry = find(tree, (n) => n.type === "button");
    expect(retry.props.className).toMatch(/\bmin-h-11\b/);
    expect(retry.props.className).toMatch(/\bmin-w-11\b/);
  });

  it("disables Retry and marks it busy while retrying, without losing its name", () => {
    const LoadFailedState = load();
    const onRetry = vi.fn();
    const tree = LoadFailedState({ title: "x", message: "y", onRetry, retrying: true });
    const retry = find(tree, (n) => n.type === "button");
    expect(retry.props.disabled).toBe(true);
    expect(retry.props["aria-busy"]).toBe(true);
    expect(accName(retry)).toBe("Retry");
  });

  it("falls back to generic copy and never reads as empty or not-found", () => {
    const LoadFailedState = load();
    const tree = LoadFailedState({ onRetry: () => {} });
    const alert = find(tree, (n) => n.props?.role === "alert");
    const copy = text(tree);
    expect(text(alert).trim().length).toBeGreaterThan(0);
    expect(copy).not.toMatch(/not found/i);
    expect(copy).not.toMatch(/no items/i);
    expect(copy).not.toMatch(/\bempty\b/i);
  });

  it("never renders a raw error stack, even when handed an Error", () => {
    const LoadFailedState = load();
    const error = new Error("boom");
    error.stack = "Error: boom\n    at loadPools (/srv/app/page.js:94:11)";
    const tree = LoadFailedState({ title: "x", message: "Request failed.", error, onRetry: () => {} });
    const json = JSON.stringify(tree, (key, value) => (key === "_owner" || key === "_store" ? undefined : value));
    expect(json).not.toContain("loadPools");
    expect(json).not.toContain("page.js:94");
    expect(text(tree)).not.toMatch(/\bat \S+ \(/);
  });

  it("omits the Retry button when no onRetry handler is given", () => {
    const LoadFailedState = load();
    const tree = LoadFailedState({ title: "x", message: "y" });
    expect(all(tree, (n) => n.type === "button")).toHaveLength(0);
    expect(find(tree, (n) => n.props?.role === "alert")).toBeTruthy();
  });
});
