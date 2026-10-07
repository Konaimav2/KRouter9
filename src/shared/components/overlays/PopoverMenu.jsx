"use client";

import React, { useCallback } from "react";
import { OverlayErrorBoundary, OverlayLayer, getFocusable, useOverlayController, useOverlayIds } from "./OverlayCore.jsx";

export default function PopoverMenu({ open, onDismiss, label, children, align = "end", mobileSheet = true, className = "" }) {
  const { panelRef, onKeyDown: onOverlayKeyDown } = useOverlayController({ open, onDismiss, mobileBack: mobileSheet });
  const { titleId } = useOverlayIds("menu");
  const onKeyDown = useCallback((event) => {
    const items = getFocusable(panelRef.current);
    const current = items.indexOf(document.activeElement);
    let next = null;
    if (event.key === "ArrowDown") next = current < items.length - 1 ? current + 1 : 0;
    else if (event.key === "ArrowUp") next = current > 0 ? current - 1 : items.length - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next !== null && items[next]) {
      event.preventDefault();
      items[next].focus();
      return;
    }
    onOverlayKeyDown(event);
  }, [onOverlayKeyDown, panelRef]);
  if (!open) return null;
  return (
    <OverlayLayer>
      <div className={`overlay-menu-root${mobileSheet ? " overlay-menu-root--mobile-sheet" : ""}`} data-overlay="menu">
        <button className="overlay-menu-dismiss" type="button" tabIndex={-1} aria-label="Close menu" onClick={() => onDismiss?.("click-away")} />
        <div ref={panelRef} className={`overlay-menu overlay-menu--${align} ${className}`} role="menu" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
          <span id={titleId} className="sr-only">{label}</span>
          <OverlayErrorBoundary onDismiss={onDismiss}>{children}</OverlayErrorBoundary>
        </div>
      </div>
    </OverlayLayer>
  );
}
