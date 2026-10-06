"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SegmentedControl } from "@/shared/components";
import UsageDashboard from "./components/UsageDashboard";
import UsageLogs from "./components/UsageLogs";
import RequestDetailsTab from "./components/RequestDetailsTab";
import PerKeyUsageSection from "./components/PerKeyUsageSection";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

const VALUE_MODES = [
  { value: "costs", label: "Costs" },
  { value: "tokens", label: "Tokens" },
];

function UsagePageSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading usage">
      <div className="h-10 w-full animate-pulse border border-[var(--ledger-border)] bg-[var(--color-surface-strong)] sm:w-96" />
      <section className="border border-border bg-surface">
        <div className="flex min-h-11 items-center gap-3 border-b border-border bg-surface-2 px-4 py-3"><span className="font-mono text-xs tabular-nums text-text-muted">01</span><span className="h-4 w-24 animate-pulse bg-[var(--color-surface-strong)]" /></div>
        <div className="divide-y divide-[var(--ledger-rule)]">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-14 animate-pulse bg-[var(--ledger-bg)]" />)}
        </div>
      </section>
    </div>
  );
}

export default function UsagePage() {
  return (
    <Suspense fallback={<UsagePageSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const periodFromUrl = searchParams.get("period");
  const [period, setPeriodState] = useState(
    PERIODS.some(({ value }) => value === periodFromUrl) ? periodFromUrl : "today"
  );
  const [mode, setMode] = useState("costs");

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details", "keys"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handlePeriodChange = (value) => {
    setPeriodState(value);
    const params = new URLSearchParams(searchParams);
    params.set("period", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "logs", label: "Logs" },
            { value: "details", label: "Details" },
            { value: "keys", label: "Keys" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        {["overview", "details", "keys"].includes(activeTab) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end" aria-label="Usage scope controls">
            {activeTab === "overview" && <SegmentedControl options={VALUE_MODES} value={mode} onChange={setMode} size="sm" className="w-full sm:w-auto" />}
            <SegmentedControl options={PERIODS} value={period} onChange={handlePeriodChange} size="sm" className="w-full sm:w-auto" />
          </div>
        )}
      </div>

      {activeTab === "overview" && <UsageDashboard period={period} mode={mode} />}
      {activeTab === "logs" && <UsageLogs />}
      {activeTab === "details" && <RequestDetailsTab />}
      {activeTab === "keys" && <PerKeyUsageSection period={period} />}
    </div>
  );
}
