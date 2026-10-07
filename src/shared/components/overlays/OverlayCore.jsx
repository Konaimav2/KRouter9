"use client";

import React, { Component, createContext, useCallback, useContext, useEffect, useId, useRef } from "react";

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
const OverlayDepthContext = createContext(0);
let scrollLocks = 0;
let savedBodyStyles = null;

function lockScroll() {
  if (typeof document === "undefined") return;
  scrollLocks += 1;
  if (scrollLocks !== 1) return;
  savedBodyStyles = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
  const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  document.documentElement.classList.add("overlay-scroll-lock");
  document.body.style.overflow = "hidden";
  if (gutter) document.body.style.paddingRight = `${gutter}px`;
}

function unlockScroll() {
  if (typeof document === "undefined" || scrollLocks === 0) return;
  scrollLocks -= 1;
  if (scrollLocks !== 0) return;
  document.documentElement.classList.remove("overlay-scroll-lock");
  document.body.style.overflow = savedBodyStyles?.overflow || "";
  document.body.style.paddingRight = savedBodyStyles?.paddingRight || "";
  savedBodyStyles = null;
}

export function getFocusable(container) {
  return container ? [...container.querySelectorAll(FOCUSABLE)].filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true") : [];
}

export function trapFocus(event, container) {
  if (event.key !== "Tab" || !container) return;
  const nodes = getFocusable(container);
  if (!nodes.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function handleOverlayKey(event, container, onDismiss) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onDismiss?.("escape");
    return;
  }
  trapFocus(event, container);
}

export function useOverlayController({ open, onDismiss, initialFocusRef, mobileBack = false }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    lockScroll();
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current || panelRef.current?.querySelector("[data-overlay-autofocus]") || getFocusable(panelRef.current)[0] || panelRef.current;
      target?.focus?.();
    });
    return () => {
      cancelAnimationFrame(frame);
      unlockScroll();
      const trigger = triggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus?.();
        else document.querySelector("main h1, main h2, [data-overlay-return-fallback]")?.focus?.();
      });
    };
  }, [open, initialFocusRef]);

  useEffect(() => {
    if (!open || !mobileBack || typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches) return undefined;
    const marker = `overlay-${Date.now()}-${Math.random()}`;
    window.history.pushState({ ...window.history.state, __overlay: marker }, "");
    const onPopState = () => dismissRef.current?.("back");
    window.addEventListener("popstate", onPopState, { once: true });
    return () => window.removeEventListener("popstate", onPopState);
  }, [open, mobileBack]);

  const onKeyDown = useCallback((event) => {
    handleOverlayKey(event, panelRef.current, dismissRef.current);
  }, []);

  return { panelRef, onKeyDown };
}

export function OverlayLayer({ allowSecondLayer = false, children }) {
  const depth = useContext(OverlayDepthContext);
  if (depth > 0 && !allowSecondLayer) {
    console.error("Nested overlays are not supported. Replace the current overlay body instead.");
    return null;
  }
  return <OverlayDepthContext.Provider value={depth + 1}>{children}</OverlayDepthContext.Provider>;
}

export class OverlayErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="overlay-error" role="alert">
        <p>Could not display this panel.</p>
        <button type="button" onClick={() => this.props.onDismiss?.("error")}>Close</button>
      </div>
    );
  }
}

export function useOverlayIds(prefix = "overlay") {
  const id = useId();
  return { titleId: `${prefix}-title-${id}`, descriptionId: `${prefix}-description-${id}` };
}
