"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ConfirmModal } from "@/shared/components/Modal";

// Masked proxy display: server-masked text, blurred, with confirm-to-reveal.
// Reveal hits a single-record `?confirm=true` endpoint (dashboard-auth,
// audit-logged, rate-limited, no-store server-side), copies via clipboard,
// and auto-hides after `autoHideMs`. Without `revealUrl` it renders masked-only.
export const PROXY_REVEAL_AUTO_HIDE_MS = 15000;

export default function MaskedProxyValue({
  masked,
  revealUrl = null,
  hasAuth = false,
  autoHideMs = PROXY_REVEAL_AUTO_HIDE_MS,
  className = "",
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef(null);
  const copyTimer = useRef(null);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  if (!masked && !revealed) return null;

  const scheduleAutoHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setRevealed(null);
      setCopied(false);
    }, autoHideMs);
  };

  const handleConfirmReveal = async () => {
    setConfirmOpen(false);
    if (!revealUrl) return;
    setLoading(true);
    setError("");
    try {
      const sep = revealUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${revealUrl}${sep}confirm=true`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Reveal failed");
        return;
      }
      if (!data.proxyUrl) {
        setError("No proxy URL stored");
        return;
      }
      setRevealed(data.proxyUrl);
      scheduleAutoHide();
    } catch {
      setError("Reveal failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!revealed) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(revealed);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = revealed;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed");
    }
  };

  const handleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setRevealed(null);
    setCopied(false);
    setError("");
  };

  if (revealed) {
    return (
      <span className={`inline-flex max-w-full items-center gap-1 ${className}`}>
        <code
          data-testid="proxy-revealed"
          className="max-w-full truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-text-main dark:bg-white/5"
        >
          {revealed}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded px-1 py-0.5 text-[10px] text-primary hover:bg-black/5 dark:hover:bg-white/5"
          title="Copy to clipboard"
        >
          <span className="material-symbols-outlined text-[14px] align-middle">
            {copied ? "check" : "content_copy"}
          </span>
        </button>
        <button
          type="button"
          onClick={handleHide}
          className="shrink-0 rounded px-1 py-0.5 text-[10px] text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
          title="Hide again"
        >
          <span className="material-symbols-outlined text-[14px] align-middle">visibility_off</span>
        </button>
      </span>
    );
  }

  return (
    <span className={`inline-flex max-w-full items-center gap-1 ${className}`}>
      <code
        data-testid="proxy-masked"
        className="max-w-full truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-text-muted blur-[3px] select-none dark:bg-white/5"
        title={hasAuth ? "Credentials hidden" : undefined}
      >
        {masked}
      </code>
      {hasAuth && <span className="shrink-0 text-[10px] text-text-muted">auth hidden</span>}
      {revealUrl && (
        <button
          type="button"
          onClick={() => { setError(""); setConfirmOpen(true); }}
          disabled={loading}
          className="shrink-0 rounded px-1 py-0.5 text-[10px] text-primary hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
          title="Reveal full URL (audit-logged)"
        >
          <span className="material-symbols-outlined text-[14px] align-middle">visibility</span>
        </button>
      )}
      {error && <span className="shrink-0 text-[10px] text-red-500">{error}</span>}
      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmReveal}
        title="Reveal proxy URL?"
        message="This shows the full proxy URL including credentials, and the access is audit-logged."
        confirmText="Reveal"
        cancelText="Cancel"
        variant="danger"
      />
    </span>
  );
}

MaskedProxyValue.propTypes = {
  masked: PropTypes.string,
  revealUrl: PropTypes.string,
  hasAuth: PropTypes.bool,
  autoHideMs: PropTypes.number,
  className: PropTypes.string,
};
