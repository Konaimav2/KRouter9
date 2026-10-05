"use client";

import Icon from "./Icon";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import HeaderMenu from "@/shared/components/HeaderMenu";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import ThemeToggle from "@/shared/components/ThemeToggle";
import ChangelogModal from "@/shared/components/ChangelogModal";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { APP_CONFIG, OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  // Media provider detail: /dashboard/media-providers/[kind]/[id]
  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      breadcrumbs: [
        { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
      ],
    };
  }

  // Media provider kind: /dashboard/media-providers/[kind]
  const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Manage your ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [],
    };
  }

  // Provider detail page: /dashboard/providers/[id]
  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo =
      OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          {
            label: providerInfo.name,
            image: getProviderIconSrc(providerInfo.id),
          },
        ],
      };
    }
  }

  if (pathname.includes("/providers") && !pathname.includes("/media-providers"))
    return {
      title: "Providers",
      description: "Manage your AI provider connections",
      icon: "dns",
      breadcrumbs: [],
    };
  if (pathname.includes("/combos"))
    return {
      title: "Combos",
      description: "Model combos with fallback",
      icon: "layers",
      breadcrumbs: [],
    };
  if (pathname.includes("/usage"))
    return {
      title: "Usage & Analytics",
      description:
        "Monitor your API usage, token consumption, and request logs",
      icon: "bar_chart",
      breadcrumbs: [],
    };
  if (pathname.includes("/auth-files"))
    return {
      title: "Auth Files",
      description: "Map provider credentials stored in the local database",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  if (pathname.includes("/quota"))
    return {
      title: "Quota Tracker",
      description: "Track and manage your API quota limits",
      icon: "data_usage",
      breadcrumbs: [],
    };
  if (pathname.includes("/mitm"))
    return {
      title: "MITM Proxy",
      description: "Intercept CLI tool traffic and route through KRouter9",
      icon: "security",
      breadcrumbs: [],
    };
  if (pathname.includes("/token-saver"))
    return {
      title: "Token Saver",
      description: "Compress prompts and outputs to save tokens",
      icon: "savings",
      breadcrumbs: [],
    };
  if (pathname.includes("/cli-tools"))
    return {
      title: "CLI Tools",
      description: "Configure CLI tools",
      icon: "terminal",
      breadcrumbs: [],
    };
  if (pathname.includes("/proxy-pools"))
    return {
      title: "Proxy Pools",
      description: "Manage your proxy pool configurations",
      icon: "lan",
      breadcrumbs: [],
    };
  if (pathname.includes("/skills"))
    return {
      title: "Agent Skills",
      description: "Copy a link and paste to your AI to use KRouter9 — no install needed",
      icon: "extension",
      breadcrumbs: [],
    };
  if (pathname.includes("/endpoint"))
    return {
      title: "Endpoint",
      description: "API endpoint configuration",
      icon: "api",
      breadcrumbs: [],
    };
  if (pathname.includes("/profile"))
    return {
      title: "Settings",
      description: "Manage your preferences",
      icon: "settings",
      breadcrumbs: [],
    };
  if (pathname.includes("/translator"))
    return {
      title: "Translator",
      description: "Debug translation flow between formats",
      icon: "translate",
      breadcrumbs: [],
    };
  if (pathname.includes("/console-log"))
    return {
      title: "Console Log",
      description: "Live server console output",
      icon: "monitor",
      breadcrumbs: [],
    };
  if (pathname === "/dashboard")
    return {
      title: "Endpoint",
      description: "API endpoint configuration",
      icon: "api",
      breadcrumbs: [],
    };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header() {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");
  const [gatewayState, setGatewayState] = useState("checking");
  const [lastChecked, setLastChecked] = useState(null);
  const [changelogOpen, setChangelogOpen] = useState(false);

  // Memoize page info to prevent unnecessary recalculations
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, description, breadcrumbs } = pageInfo;

  useEffect(() => {
    let cancelled = false;

    async function loadAuthStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDisplayName(data?.displayName || data?.samlName || data?.samlEmail || data?.oidcName || data?.oidcEmail || "");
          setLoginMethod(data?.loginMethod || "");
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setLoginMethod("");
        }
      }
    }

    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const checkGateway = async () => {
    setGatewayState("checking");
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setGatewayState(response.ok ? "connected" : "degraded");
    } catch {
      setGatewayState("offline");
    } finally {
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => {
        if (!cancelled) setGatewayState(response.ok ? "connected" : "degraded");
      })
      .catch(() => {
        if (!cancelled) setGatewayState("offline");
      })
      .finally(() => {
        if (!cancelled) setLastChecked(new Date());
      });
    return () => { cancelled = true; };
  }, []);

  const gatewayLabel = gatewayState === "checking"
    ? "Checking gateway"
    : gatewayState === "connected"
      ? "Local"
      : gatewayState === "degraded"
        ? "Degraded"
        : "Offline";

  return (
    <>
      <header className="route-ribbon" aria-label="Route context">
        <div className="route-ribbon__context">
          {breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="route-breadcrumb">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.label}-${crumb.href || "current"}`} className="flex min-w-0 items-center gap-2">
                  {index > 0 ? <span aria-hidden="true" className="text-[var(--color-text-subtle)]">/</span> : null}
                  {crumb.href ? <Link href={crumb.href}>{translate(crumb.label)}</Link> : <h1>{translate(crumb.label)}</h1>}
                </div>
              ))}
            </nav>
          ) : title ? <h1 className="route-ribbon__title">{translate(title)}</h1> : null}
          {description ? <span className="sr-only">{translate(description)}</span> : null}
        </div>

        <div className={`gateway-state gateway-state--${gatewayState}`} role="status" aria-live="polite">
          <span className="gateway-state__mark" aria-hidden="true" />
          <span>{gatewayLabel}</span>
          <span className="gateway-state__version">v{APP_CONFIG.version}</span>
          {lastChecked ? <span className="sr-only">Last checked {lastChecked.toLocaleTimeString()}</span> : null}
          {gatewayState === "offline" || gatewayState === "degraded" ? <button type="button" onClick={checkGateway}>Retry</button> : null}
        </div>

        <div className="route-ribbon__actions" aria-label="Page and application actions">
          <HeaderSearch />
          <Link href="/docs" className="ribbon-action"><Icon name="menu_book" className="text-[18px]" aria-hidden="true" /><span>Docs</span></Link>
          <button type="button" onClick={() => setChangelogOpen(true)} className="ribbon-action"><Icon name="history" className="text-[18px]" aria-hidden="true" /><span>Change Log</span></button>
          {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") ? <div className="data-text hidden max-w-44 truncate border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] md:block" title={displayName}>{displayName} · {loginMethod}</div> : null}
          <ThemeToggle className="ribbon-icon-action" />
          <HeaderLanguage />
          <HeaderMenu onLogout={handleLogout} />
        </div>
      </header>
      <ChangelogModal isOpen={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </>
  );

}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative hidden w-[180px] sm:block lg:w-[260px]">
      <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-[16px] pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }}
        placeholder={placeholder}
        aria-label={placeholder || "Search this page"}
        className="h-10 w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] pl-8 pr-8 text-sm focus:border-[var(--input-border-focus)] focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded"
          aria-label="Clear search"
        >
          <Icon name="close" className="text-[16px]" />
        </button>
      )}
    </div>
  );
}
