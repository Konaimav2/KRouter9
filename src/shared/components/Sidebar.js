"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { ConfirmModal } from "./Modal";
import Icon from "./Icon";

const GROUPS = [
  {
    label: "Run",
    items: [
      ["/dashboard/basic-chat", "Playground", "chat"],
      ["/dashboard/providers", "Providers", "dns"],
      ["/dashboard/combos", "Combos", "account_tree"],
    ],
  },
  {
    label: "Measure",
    items: [
      ["/dashboard/usage", "Usage", "query_stats"],
      ["/dashboard/quota", "Quota Tracker", "data_usage"],
      ["/dashboard/console-log", "Console Log", "terminal"],
      ["/dashboard/token-saver", "Token Saver", "savings"],
    ],
  },
  {
    label: "Configure",
    items: [
      ["/dashboard/endpoint", "Endpoint & Key", "api"],
      ["/dashboard/proxy-pools", "Proxy Pools", "lan"],
      ["/dashboard/media-providers/web", "Media Providers", "perm_media"],
      ["/dashboard/skills", "Skills", "extension"],
      ["/dashboard/cli-tools", "CLI Tools", "terminal"],
      ["/dashboard/translator", "Translator", "translate", "translator"],
      ["/dashboard/profile", "Settings", "settings"],
    ],
  },
];

function NavGlyph({ name }) {
  return <Icon name={name} />;
}

NavGlyph.propTypes = { name: PropTypes.string.isRequired };

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const asideRef = useRef(null);

  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => setEnableTranslator(data.enableTranslator === true)).catch(() => {});
    fetch("/api/version").then((response) => response.json()).then((data) => { if (data.hasUpdate) setUpdateInfo(data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!onClose) return undefined;
    const previous = document.activeElement;
    const focusable = asideRef.current?.querySelector("a,button");
    focusable?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !asideRef.current) return;
      const items = [...asideRef.current.querySelectorAll('a,button:not(:disabled)')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus?.(); };
  }, [onClose]);

  const active = (href) => href === "/dashboard/endpoint"
    ? pathname === "/dashboard" || pathname.startsWith(href)
    : pathname.startsWith(href);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try { await fetch("/api/version/shutdown", { method: "POST" }); } catch {}
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  return (
    <>
      <aside ref={asideRef} className="flex h-full w-[var(--layout-rail-width)] flex-col border-r border-[var(--nav-rule)] bg-[var(--nav-bg)] text-[var(--nav-fg)]">
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-[var(--nav-rule)] px-5">
          <img src="/krouter9.png" alt="" className="size-8 rounded-[var(--radius-sm)] object-contain" />
          <div className="min-w-0">
            <Link href="/dashboard/basic-chat" onClick={onClose} className="block text-[17px] font-semibold tracking-[-.02em] text-[var(--nav-fg)]">{APP_CONFIG.name}</Link>
            <span className="data-text block text-[10px] text-[var(--nav-muted)]">v{APP_CONFIG.version}</span>
          </div>
          {onClose ? <button type="button" onClick={onClose} aria-label="Close navigation" className="ml-auto grid size-11 place-items-center text-[var(--nav-muted)] lg:hidden"><NavGlyph name="close" /></button> : null}
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
          {GROUPS.map((group) => (
            <section key={group.label} className="mb-5 border-l border-[var(--nav-rule)] pl-2">
              <h2 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--nav-muted)]">{group.label}</h2>
              <div className="space-y-0.5">
                {group.items.map(([href, label, icon, gate]) => {
                  if (gate === "translator" && !enableTranslator) return null;
                  const selected = active(href);
                  return (
                    <Link key={href} href={href} onClick={onClose} aria-current={selected ? "page" : undefined} className={cn(
                      "relative flex h-10 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-[13px] font-medium transition-colors",
                      selected ? "bg-[var(--nav-active-bg)] text-[var(--nav-active)] before:absolute before:inset-y-2 before:-left-[9px] before:w-0.5 before:bg-[var(--nav-active)]" : "text-[var(--nav-muted)] hover:bg-white/5 hover:text-[var(--nav-fg)]"
                    )}>
                      <NavGlyph name={icon} /><span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--nav-rule)] p-3">
          {updateInfo ? (
            <a href={UPDATER_CONFIG.installCmdLatest ? "/dashboard/profile#updates" : "/dashboard/profile"} onClick={onClose} className="mb-2 flex min-h-10 items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-primary-border)] bg-[var(--nav-active-bg)] px-3 text-xs text-[var(--nav-active)]">
              <span>Update available</span><span className="data-text">v{updateInfo.latestVersion}</span>
            </a>
          ) : <div className="mb-2 px-3 py-1 text-[10px] text-[var(--nav-muted)]">System ready · local gateway</div>}
          <button type="button" onClick={() => setShutdownOpen(true)} className="flex h-10 w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 text-left text-[13px] text-[var(--color-danger)] hover:bg-[var(--color-danger-wash)]">
            <NavGlyph name="power_settings_new" /> Shutdown
          </button>
        </div>
      </aside>
      <ConfirmModal isOpen={shutdownOpen} onClose={() => setShutdownOpen(false)} onConfirm={handleShutdown} title="Shutdown KRouter9?" message="Active gateway requests will be interrupted. The server must be started again from the host." confirmText="Shutdown" cancelText="Cancel" variant="danger" loading={isShuttingDown} />
    </>
  );
}

Sidebar.propTypes = { onClose: PropTypes.func };
