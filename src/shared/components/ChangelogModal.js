"use client";

import Icon from "@/shared/components/Icon";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { marked } from "marked";
import { GITHUB_CONFIG } from "@/shared/constants/config";

marked.setOptions({ gfm: true, breaks: true });

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export default function ChangelogModal({ isOpen, onClose }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  // Header passes an inline onClose; keep the latest in a ref so the focus
  // effect runs once per open instead of on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || html) return;
    setLoading(true);
    setError("");
    fetch(GITHUB_CONFIG.changelogUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((md) => setHtml(marked.parse(md)))
      .catch((err) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [isOpen, html]);

  // Focus moves into the dialog on open, Escape closes it, Tab stays inside,
  // and focus returns to the opener (the Change Log button) on close.
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const opener = document.activeElement;
    closeButtonRef.current?.focus?.();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault?.();
        event.stopPropagation?.();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const nodes = [...modalRef.current.querySelectorAll(FOCUSABLE)];
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !modalRef.current.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !modalRef.current.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && opener.isConnected !== false) opener.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Change Log"
        className="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-black/10 bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:border-white/10"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-3 dark:border-white/5">
          <div>
            <h2 className="text-lg font-semibold text-text-main">Change Log</h2>
            <p className="mt-0.5 text-[11px] text-text-muted">Release history, newest first</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="-my-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {/* Body */}
        <div tabIndex={0} role="region" aria-label="Change Log entries" className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          {loading && (
            <div className="flex items-center justify-center py-10 text-text-muted">
              <Icon name="progress_activity" className="mr-2 animate-spin" />
              Loading...
            </div>
          )}
          {error && (
            <div role="alert" className="py-4 text-red-500">
              Failed to load changelog: {error}
            </div>
          )}
          {!loading && !error && html && (
            <div
              className="changelog-body text-text-main"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

ChangelogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
