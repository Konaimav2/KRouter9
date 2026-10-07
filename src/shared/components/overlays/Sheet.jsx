"use client";

import React from "react";
import { OverlayErrorBoundary, OverlayLayer, useOverlayController, useOverlayIds } from "./OverlayCore.jsx";

export default function Sheet({ open, onDismiss, title, description, children, footer, side = "right", dismissOnScrim = true, fullHeight = false, className = "" }) {
  const { panelRef, onKeyDown } = useOverlayController({ open, onDismiss, mobileBack: true });
  const { titleId, descriptionId } = useOverlayIds("sheet");
  if (!open) return null;
  return (
    <OverlayLayer>
      <div className="overlay-root overlay-root--sheet" data-overlay="sheet">
        <button className="overlay-scrim" type="button" tabIndex={-1} aria-label="Close sheet" onClick={dismissOnScrim ? () => onDismiss?.("scrim") : undefined} />
        <section ref={panelRef} className={`overlay-shell overlay-sheet overlay-sheet--${side}${fullHeight ? " overlay-sheet--full" : ""} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={onKeyDown}>
          <header className="overlay-header">
            <div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
            <button className="overlay-close" type="button" aria-label="Close" onClick={() => onDismiss?.("close")}>×</button>
          </header>
          <div className="overlay-body"><OverlayErrorBoundary onDismiss={onDismiss}>{children}</OverlayErrorBoundary></div>
          {footer ? <footer className="overlay-footer">{footer}</footer> : null}
        </section>
      </div>
    </OverlayLayer>
  );
}
