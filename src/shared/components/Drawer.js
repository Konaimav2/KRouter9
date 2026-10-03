"use client";

import Icon from "./Icon";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/shared/utils/cn";

export default function Drawer({ isOpen, onClose, title, children, width = "md", className }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const widths = { sm:"w-[min(100vw,400px)]", md:"w-[min(100vw,500px)]", lg:"w-[min(100vw,600px)]", xl:"w-[min(100vw,800px)]", full:"w-full" };
  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.activeElement;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panelRef.current?.querySelector("button,input,select,textarea,a[href]")?.focus());
    const keydown = (event) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = ""; previous?.focus?.(); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[var(--z-drawer)]"><button type="button" tabIndex={-1} aria-label="Close sheet" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={onClose} /><div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} className={cn("absolute right-0 top-0 flex h-full flex-col border-l border-[var(--dialog-border)] bg-[var(--dialog-bg)] shadow-[var(--shadow-float)]", widths[width] || widths.md, className)}><div className="flex min-h-16 shrink-0 items-center justify-between border-b border-[var(--ledger-rule)] px-5">{title ? <h2 id={titleId} className="text-lg font-semibold">{title}</h2> : <span />}<button type="button" onClick={onClose} aria-label="Close sheet" className="grid size-11 place-items-center"><Icon name="close" className="text-[20px]" /></button></div><div className="flex-1 overflow-y-auto p-5 custom-scrollbar">{children}</div></div></div>;
}
