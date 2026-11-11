"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { cn } from "@/shared/utils/cn";

const MEDIA_BASE = "/dashboard/media-providers";
// webSearch and webFetch share the /web hub page (see [kind]/page.js).
const WEB_KIND_IDS = new Set(["webSearch", "webFetch"]);
const WEB_HREF = `${MEDIA_BASE}/web`;

function buildKindLinks() {
  const links = [];
  for (const kind of MEDIA_PROVIDER_KINDS) {
    if (WEB_KIND_IDS.has(kind.id)) {
      const web = links.find((link) => link.href === WEB_HREF);
      if (web) web.label = `${web.label} & ${kind.label.replace(/^Web\s+/i, "")}`;
      else links.push({ href: WEB_HREF, label: kind.label, icon: kind.icon });
      continue;
    }
    links.push({ href: `${MEDIA_BASE}/${kind.id}`, label: kind.label, icon: kind.icon });
  }
  return links;
}

/**
 * Kind switcher for the media hub. Shown on the listing pages only
 * (/media-providers/<kind>); detail and combo pages keep their own breadcrumb.
 */
export default function MediaKindSwitcher() {
  const pathname = usePathname() || "";
  const match = pathname.match(/^\/dashboard\/media-providers\/([^/]+)\/?$/);
  if (!match || match[1] === "combo") return null;
  const current = WEB_KIND_IDS.has(match[1]) ? WEB_HREF : `${MEDIA_BASE}/${match[1]}`;
  const links = buildKindLinks();

  return (
    <nav aria-label="Media kinds" className="mb-4 min-w-0">
      <ul className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {links.map((link) => {
          const selected = link.href === current;
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                  selected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]",
                )}
              >
                <Icon name={link.icon} size={18} aria-hidden="true" />
                <span>{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
