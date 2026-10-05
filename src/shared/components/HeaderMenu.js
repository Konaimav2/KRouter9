"use client";

import Icon from "@/shared/components/Icon";
import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

export default function HeaderMenu({ onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="ribbon-icon-action"
        aria-label="Account menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Icon name="account_circle" />
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-full z-[var(--z-menu)] mt-2 w-48 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] py-1 shadow-[var(--shadow-tray)]" role="menu">
          <button type="button" role="menuitem" onClick={() => { setIsOpen(false); onLogout(); }} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-wash)]">
            <Icon name="logout" /><span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

HeaderMenu.propTypes = { onLogout: PropTypes.func.isRequired };
