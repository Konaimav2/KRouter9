"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/shared/components/Icon";

export default function CopyButton({ text, path, label = "Copy" }) {
  const [state, setState] = useState("idle");
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onCopy = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const value = (path ? `${origin}${path}` : (text || "")).split("$BASE").join(origin);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      timerRef.current = setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("failed");
    }
  };

  return <span className="inline-flex flex-col items-end gap-1"><button type="button" onClick={onCopy} aria-label={label} className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--button-border)] px-2.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"><Icon name={state === "copied" ? "check" : "copy"} size={15}/>{state === "copied" ? "Copied" : label}</button><span className="sr-only" aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed — select manually" : ""}</span>{state === "failed" ? <span className="text-xs text-[var(--color-danger)]">Copy failed — select manually</span> : null}</span>;
}
