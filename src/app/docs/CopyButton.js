"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const value = typeof text === "function" ? text() : text;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied" : label}
      aria-label={label}
      className="rounded border border-border px-2 py-0.5 text-xs text-text-muted hover:bg-surface-2"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
