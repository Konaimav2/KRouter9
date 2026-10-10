"use client";

import React from "react";
import { OverlayErrorBoundary, OverlayLayer, useOverlayController, useOverlayIds } from "./OverlayCore.jsx";

const WIDTHS = { compact: "480", standard: "640", wide: "800" };

export default function Dialog({ open, onDismiss, title, description, children, footer, width = "standard", dismissOnScrim = true, mobileSheet = true, className = "" }) {
  const { panelRef, onKeyDown } = useOverlayController({ open, onDismiss, mobileBack: mobileSheet });
  const { titleId, descriptionId } = useOverlayIds("dialog");
  if (!open) return null;
  const shellWidth = WIDTHS[width] || WIDTHS.standard;
  return (
    <OverlayLayer>
      <div className={`overlay-root${mobileSheet ? " overlay-root--mobile-sheet" : ""}`} data-overlay="dialog">
        <button className="overlay-scrim opacity-100 starting:opacity-0 [&:has(:focus-visible)]:transition-none!" style={{ animation: "none", transition: "opacity var(--duration-base) var(--ease-enter)" }} type="button" tabIndex={-1} aria-label="Close dialog" onClick={dismissOnScrim ? () => onDismiss?.("scrim") : undefined} />
        <section style={{ animation: "none", transition: "opacity var(--duration-base) var(--ease-enter)" }} ref={panelRef} className={`overlay-shell opacity-100 starting:opacity-0 [&:has(:focus-visible)]:transition-none! overlay-dialog overlay-dialog--${shellWidth} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={onKeyDown}>
          <header className="overlay-header">
            <div><h2 id={titleId} tabIndex={-1}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
            <button className="overlay-close" type="button" aria-label="Close" onClick={() => onDismiss?.("close")}>×</button>
          </header>
          <div className="overlay-body"><OverlayErrorBoundary onDismiss={onDismiss}>{children}</OverlayErrorBoundary></div>
          {footer ? <footer className="overlay-footer">{footer}</footer> : null}
        </section>
      </div>
    </OverlayLayer>
  );
}
