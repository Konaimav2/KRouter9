"use client";

import Icon from "../Icon";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
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
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const isPlayground = pathname === "/dashboard/basic-chat";

  useEffect(() => {
    document.documentElement.classList.add("dashboard-scroll-lock");

    return () => {
      document.documentElement.classList.remove("dashboard-scroll-lock");
    };
  }, []);

  return (
    <div className="route-shell">
      <a href="#dashboard-main" className="skip-link">Skip to instrument field</a>
      <div className="fixed right-4 top-[calc(var(--layout-route-ribbon)+var(--space-3))] z-[var(--z-toast)] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {notifications.map((notification) => {
          const [icon, color] = TOASTS[notification.type] || TOASTS.info;
          return (
            <div key={notification.id} className="relative overflow-hidden rounded-[var(--radius-control)] border border-[var(--toast-border)] bg-[var(--toast-bg)] px-4 py-3 shadow-[var(--shadow-tray)]" style={{ borderLeftColor: color }}>
              <div className="flex items-start gap-3"><Icon name={icon} style={{ color }} /><div className="min-w-0 flex-1">{notification.title ? <p className="text-sm font-semibold">{notification.title}</p> : null}<p className="text-xs text-[var(--color-text-muted)]">{notification.message}</p></div>{notification.dismissible ? <button type="button" onClick={() => removeNotification(notification.id)} aria-label="Dismiss notification" className="grid size-8 place-items-center text-[var(--color-text-muted)]"><Icon name="close" className="text-[16px]" /></button> : null}</div>
            </div>
          );
        })}
      </div>

      <Sidebar />
      <div className="route-shell__workspace">
        <Header key={pathname} />
        <main id="dashboard-main" tabIndex={-1} className={isPlayground ? "instrument-field instrument-field--playground" : "instrument-field custom-scrollbar"}>
          <div className={isPlayground ? "flex h-full min-h-0 w-full flex-1 flex-col" : "w-full"}>{children}</div>
        </main>
      </div>
    </div>
  );
}
