"use client";

import Icon from "./Icon";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/shared/utils/cn";
import Button from "./Button";

function trapKey(event, container) {
  if (event.key !== "Tab" || !container) return;
  const nodes = [...container.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];
  if (!nodes.length) { event.preventDefault(); return; }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function operationFromTitle(title) {
  if (typeof title !== "string") return "DIALOG";
  if (/^(create|add|new)\b/i.test(title)) return "CREATE";
  if (/^(edit|manage|update)\b/i.test(title)) return "EDIT";
  if (/^(deploy|setup|install)\b/i.test(title)) return "DEPLOY";
  if (/^(confirm|delete|remove|disable|reset|rotate)\b/i.test(title)) return "CONFIRM";
  return "DIALOG";
}

export default function Modal({ isOpen, onClose, title, operationLabel, children, footer, size = "md", closeOnOverlay = true, className }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", full: "max-w-4xl" };

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panelRef.current?.querySelector('[data-autofocus],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')?.focus());
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); else trapKey(event, panelRef.current); };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; previous?.focus?.(); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const operation = operationLabel || operationFromTitle(title);

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" role="presentation">
      <button type="button" tabIndex={-1} aria-label="Close dialog" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={closeOnOverlay ? onClose : undefined} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} className={cn("relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--dialog-radius)] border border-[var(--dialog-border)] bg-[var(--dialog-bg)] shadow-[var(--shadow-float)]", sizes[size], className)}>
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--ledger-rule)] px-5 py-2">
          {title ? <div className="flex min-w-0 items-baseline gap-3"><span className="ledger-number shrink-0">{operation}</span><h2 id={titleId} className="min-w-0 text-lg font-semibold">{title}</h2></div> : <span />}
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"><Icon name="close" className="text-[20px]" /></button>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--ledger-rule)] bg-[var(--dialog-bg)] p-4 sm:flex-row sm:items-center sm:justify-end">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title = "Confirm", message, confirmText = "Confirm", cancelText = "Cancel", variant = "danger", loading = false }) {
  return <Modal isOpen={isOpen} onClose={onClose} title={title} operationLabel="CONFIRM" size="sm" closeOnOverlay={!loading} footer={<><Button data-autofocus variant="secondary" onClick={onClose} disabled={loading}>{cancelText}</Button><Button variant={variant} onClick={onConfirm} loading={loading}>{confirmText}</Button></>}><p className="text-sm leading-6 text-[var(--color-text-muted)]">{message}</p></Modal>;
}
