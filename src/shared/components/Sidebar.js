"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { ConfirmModal } from "./Modal";
import Icon from "./Icon";

const ZONES = [
  {
    id: "operate",
    label: "Operate",
    icon: "route",
    items: [
      ["/dashboard/basic-chat", "Playground", "chat"],
      ["/dashboard/endpoint", "Endpoint & Key", "api"],
      ["/dashboard/providers", "Providers", "dns"],
      ["/dashboard/combos", "Combos", "account_tree"],
    ],
  },
  {
    id: "observe",
    label: "Observe",
    icon: "query_stats",
    items: [
      ["/dashboard/usage", "Usage", "query_stats"],
      ["/dashboard/quota", "Quota Tracker", "data_usage"],
      ["/dashboard/token-saver", "Token Saver", "savings"],
      ["/dashboard/console-log", "Console Log", "terminal"],
      ["/dashboard/translator", "Translator", "translate", "translator"],
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "settings",
    items: [
      ["/dashboard/proxy-pools", "Proxy Pools", "lan"],
      ["/dashboard/media-providers/web", "Media", "perm_media"],
      ["/dashboard/skills", "Skills", "extension"],
      ["/dashboard/cli-tools", "CLI Tools", "terminal"],
      ["/dashboard/profile", "Settings", "settings"],
    ],
  },
];

function isDestinationActive(pathname, href) {
  if (href === "/dashboard/endpoint") return pathname === "/dashboard" || pathname.startsWith(href);
  return pathname.startsWith(href);
}

export default function Sidebar() {
  const pathname = usePathname();
  const activeZone = useMemo(() => ZONES.find((zone) => zone.items.some(([href]) => isDestinationActive(pathname, href)))?.id || "operate", [pathname]);
  const [openZone, setOpenZone] = useState(null);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const trayRef = useRef(null);
  const zoneRefs = useRef([]);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((data) => setEnableTranslator(data.enableTranslator === true)).catch(() => {});
    fetch("/api/version").then((response) => response.json()).then((data) => { if (data.hasUpdate) setUpdateInfo(data); }).catch(() => {});
  }, []);

  // Route changes always restore the full instrument field.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpenZone(null), [pathname]);

  useEffect(() => {
    if (!openZone || !trayRef.current) return undefined;
    const tray = trayRef.current;
    const focusable = () => [...tray.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled)')];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenZone(null);
        returnFocusRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openZone]);

  const selectZone = (zoneId, trigger) => {
    returnFocusRef.current = trigger;
    setOpenZone((current) => current === zoneId ? null : zoneId);
  };

  const onZoneKeyDown = (event, index) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ZONES.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % ZONES.length;
    else next = (index - 1 + ZONES.length) % ZONES.length;
    zoneRefs.current[next]?.focus();
  };

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try { await fetch("/api/version/shutdown", { method: "POST" }); } catch {}
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  const zone = ZONES.find((candidate) => candidate.id === openZone);

  return (
    <>
      <aside className="command-spine" aria-label="Dashboard zones">
        <Link href="/dashboard/basic-chat" className="command-spine__brand" aria-label={`${APP_CONFIG.name} home`}>
          <Image src="/krouter9.png" alt="" width={32} height={32} className="size-8 rounded-[var(--radius-control)] object-contain" />
        </Link>
        <nav className="command-spine__zones" aria-label="Operating zones">
          {ZONES.map((item, index) => {
            const expanded = item.id === openZone;
            const current = item.id === activeZone;
            return (
              <button
                key={item.id}
                ref={(node) => { zoneRefs.current[index] = node; }}
                type="button"
                className={cn("command-zone", current && "is-current")}
                aria-current={current ? "page" : undefined}
                aria-expanded={expanded}
                aria-controls="route-task-tray"
                tabIndex={current ? 0 : -1}
                onClick={(event) => selectZone(item.id, event.currentTarget)}
                onKeyDown={(event) => onZoneKeyDown(event, index)}
              >
                <Icon name={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="command-spine__utility">
          {updateInfo ? (
            <a href={UPDATER_CONFIG.installCmdLatest ? "/dashboard/profile#updates" : "/dashboard/profile"} className="command-utility" aria-label={`Update available, version ${updateInfo.latestVersion}`}>
              <Icon name="download" aria-hidden="true" /><span>Update<br /><b>v{updateInfo.latestVersion}</b></span>
            </a>
          ) : <span className="command-ready" title={`KRouter9 v${APP_CONFIG.version}`}>v{APP_CONFIG.version}</span>}
          <button type="button" onClick={() => setShutdownOpen(true)} className="command-utility command-utility--danger" aria-label="Shutdown KRouter9">
            <Icon name="power_settings_new" aria-hidden="true" /><span>Shutdown</span>
          </button>
        </div>
      </aside>

      {zone ? (
        <>
          <button type="button" className="task-tray-backdrop" onClick={() => { setOpenZone(null); returnFocusRef.current?.focus(); }} aria-label="Close task tray" />
          <aside ref={trayRef} id="route-task-tray" className="task-tray" aria-label={`${zone.label} tasks`} aria-modal="true" role="dialog">
            <header className="task-tray__header">
              <div className="flex min-w-0 items-center gap-3">
                <Image src="/krouter9.png" alt="" width={32} height={32} className="task-tray__mobile-mark size-8 rounded-[var(--radius-control)] object-contain" />
                <div><p className="text-xs text-[var(--color-text-muted)]">{APP_CONFIG.name}</p><h2 className="text-xl font-semibold">{zone.label}</h2></div>
              </div>
              <button type="button" onClick={() => { setOpenZone(null); returnFocusRef.current?.focus(); }} className="task-tray__close"><Icon name="close" aria-hidden="true" /><span>Close</span></button>
            </header>
            <nav className="task-tray__nav" aria-label={`${zone.label} destinations`}>
              {zone.items.map(([href, label, icon, gate]) => {
                if (gate === "translator" && !enableTranslator) return null;
                const selected = isDestinationActive(pathname, href);
                return (
                  <Link key={href} href={href} aria-current={selected ? "page" : undefined} className={cn("task-destination", selected && "is-current")}>
                    <Icon name={icon} aria-hidden="true" /><span>{label}</span>{selected ? <span className="ml-auto text-xs">Current</span> : <Icon name="chevron_right" className="ml-auto" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>
            {zone.id === "system" ? (
              <div className="task-tray__mobile-links">
                <Link href="/docs" className="task-destination"><Icon name="menu_book" aria-hidden="true" /><span>Docs</span></Link>
                <Link href="/dashboard/profile#changelog" className="task-destination"><Icon name="history" aria-hidden="true" /><span>Change Log</span></Link>
              </div>
            ) : null}
          </aside>
        </>
      ) : null}

      <ConfirmModal isOpen={shutdownOpen} onClose={() => setShutdownOpen(false)} onConfirm={handleShutdown} title="Shutdown KRouter9?" message="Active gateway requests will be interrupted. The server must be started again from the host." confirmText="Shutdown" cancelText="Cancel" variant="danger" loading={isShuttingDown} />
    </>
  );
}

Sidebar.propTypes = { onClose: PropTypes.func };
