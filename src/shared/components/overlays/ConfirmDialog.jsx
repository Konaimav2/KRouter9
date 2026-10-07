"use client";

import React, { useRef } from "react";
import { OverlayErrorBoundary, OverlayLayer, useOverlayController, useOverlayIds } from "./OverlayCore.jsx";

export default function ConfirmDialog({ open, onCancel, onConfirm, title, description, children, actionLabel, cancelLabel = "Cancel", destructive = false, pending = false }) {
  const cancelRef = useRef(null);
  const { panelRef, onKeyDown } = useOverlayController({ open, onDismiss: onCancel, initialFocusRef: cancelRef });
  const { titleId, descriptionId } = useOverlayIds("confirm");
  if (!open) return null;
  if (!actionLabel || /^(confirm|yes|ok)$/i.test(actionLabel.trim())) throw new Error("ConfirmDialog requires a specific actionLabel such as ‘Delete key’.");
  return (
    <OverlayLayer allowSecondLayer>
      <div className="overlay-root overlay-root--confirm" data-overlay="confirm">
        <div className="overlay-scrim" aria-hidden="true" />
        <section ref={panelRef} className="overlay-shell overlay-confirm" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={onKeyDown}>
          <header className="overlay-header"><div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div></header>
          <div className="overlay-body"><OverlayErrorBoundary onDismiss={onCancel}>{children}</OverlayErrorBoundary></div>
          <footer className="overlay-footer">
            <button ref={cancelRef} data-overlay-autofocus type="button" className="overlay-button overlay-button--secondary" disabled={pending} onClick={() => onCancel?.("cancel")}>{cancelLabel}</button>
            <button type="button" className={`overlay-button ${destructive ? "overlay-button--danger" : "overlay-button--primary"}`} disabled={pending} onClick={onConfirm}>{pending ? `${actionLabel}…` : actionLabel}</button>
          </footer>
        </section>
      </div>
    </OverlayLayer>
  );
}
