"use client";

import Link from "next/link";
import Image from "next/image";
import Icon from "@/shared/components/Icon";

export default function MitmLinkCard({ tool, rowNumber }) {
  return (
    <div className="signal-row grid gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-center">
      <span className="ledger-number">
        {String(rowNumber).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center">
          <Image
            src={tool.image}
            alt=""
            width={32}
            height={32}
            className="size-8 object-contain"
            sizes="32px"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            loading="lazy"
            decoding="async"
          />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{tool.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            {tool.description}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <span className="inline-flex border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2 py-1 text-[10px] font-medium text-[var(--badge-fg)]">
          MITM
        </span>
        <p className="data-text mt-1 truncate text-xs text-[var(--color-text-muted)]">
          {tool.mitmDomain}
        </p>
      </div>
      <Link
        href="/dashboard/mitm"
        className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--color-border)] px-3 text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        Open <Icon name="chevron_right" size={16} />
      </Link>
    </div>
  );
}
