"use client";

import { useState } from "react";

// Copy-to-clipboard button for static content. All props must be static
// strings (server components cannot pass functions to client components).
// `path` resolves against the current origin in the browser; in `text`, the
// literal token $BASE is replaced with the origin at click time.
export default function CopyButton({ text, path, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const raw = path ? `${origin}${path}` : (text || "");
    const value = raw.split("$BASE").join(origin);
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
