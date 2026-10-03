"use client";

import Icon from "../Icon";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";

const TOASTS = {
  success: ["check_circle", "var(--color-success)"],
  error: ["error", "var(--color-danger)"],
  warning: ["warning", "var(--color-warning)"],
  info: ["info", "var(--color-info)"],
};

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const menuButtonRef = useRef(null);
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const isPlayground = pathname === "/dashboard/basic-chat";

  // Route changes close the transient mobile navigation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSidebarOpen(false), [pathname]);
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onEscape = (event) => { if (event.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-canvas)]">
      <a href="#dashboard-main" className="skip-link">Skip to content</a>
      <div className="fixed right-4 top-[calc(var(--layout-workbar-height)+var(--space-3))] z-[var(--z-toast)] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {notifications.map((notification) => {
          const [icon, color] = TOASTS[notification.type] || TOASTS.info;
          return (
            <div key={notification.id} className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--toast-border)] bg-[var(--toast-bg)] px-4 py-3 shadow-[var(--shadow-float)]" style={{ borderLeftColor: color }}>
              <div className="flex items-start gap-3"><Icon name={icon} style={{ color }} /><div className="min-w-0 flex-1">{notification.title ? <p className="text-sm font-semibold">{notification.title}</p> : null}<p className="text-xs text-[var(--color-text-muted)]">{notification.message}</p></div>{notification.dismissible ? <button type="button" onClick={() => removeNotification(notification.id)} aria-label="Dismiss notification" className="grid size-8 place-items-center text-[var(--color-text-muted)]"><Icon name="close" className="text-[16px]" /></button> : null}</div>
            </div>
          );
        })}
      </div>

      {sidebarOpen ? <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-[var(--color-overlay)] lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}
      <div className="hidden shrink-0 lg:flex"><Sidebar /></div>
      <div className={`fixed inset-y-0 left-0 z-50 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-[var(--duration-base)]`}><Sidebar onClose={() => { setSidebarOpen(false); menuButtonRef.current?.focus(); }} /></div>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-canvas)]">
        <Header key={pathname} onMenuClick={() => setSidebarOpen(true)} menuButtonRef={menuButtonRef} />
        <div id="dashboard-main" tabIndex={-1} className={isPlayground ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain p-[var(--layout-page-pad-mobile)] md:p-[var(--layout-page-pad-tablet)] lg:p-[var(--layout-page-pad-desktop)] custom-scrollbar"}>
          <div className={isPlayground ? "flex h-full min-h-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-[var(--layout-content-max)]"}>{children}</div>
        </div>
      </main>
    </div>
  );
}
