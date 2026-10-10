import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import commonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { expect, it, vi } from "vitest";

it("routes Escape outside panel focus through the active overlay dismissal guard", () => {
  const effects = [];
  const panel = { contains: () => false };
  let refIndex = 0;
  const refs = [{ current: panel }, { current: null }, { current: null }];
  const hooks = { ...React, useRef: () => refs[refIndex++], useEffect: (fn) => effects.push(fn), useCallback: (fn) => fn };
  const code = transformSync(readFileSync(new URL("../../src/shared/components/overlays/OverlayCore.jsx", import.meta.url), "utf8"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [commonjs] }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(() => hooks, mod, mod.exports);
  const listeners = new Map();
  vi.stubGlobal("document", { querySelectorAll: () => [], activeElement: {}, body: { style: {} }, documentElement: { clientWidth: 390, classList: { add() {}, remove() {} } }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) });
  vi.stubGlobal("window", { innerWidth: 390 });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const dismiss = vi.fn();
  let roots = [];
  document.querySelectorAll = () => roots;
  try {
    mod.exports.useOverlayController({ open: true, onDismiss: dismiss });
    const cleanups = effects.map((fn) => fn());
    const event = { key: "Escape", target: {}, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    listeners.get("keydown")?.(event);
    expect(dismiss).toHaveBeenCalledWith("escape");
    dismiss.mockClear();
    roots = [{ contains: () => true }, { contains: () => false }];
    listeners.get("keydown")?.(event);
    expect(dismiss).not.toHaveBeenCalled();
    roots = [{ contains: () => true }];
    listeners.get("keydown")?.({ ...event, defaultPrevented: true });
    expect(dismiss).not.toHaveBeenCalled();
    listeners.get("keydown")?.({ ...event, key: "Enter" });
    expect(dismiss).not.toHaveBeenCalled();
    listeners.get("keydown")?.(event);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith("escape");
    cleanups.forEach((fn) => fn?.());
    expect(listeners.has("keydown")).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
