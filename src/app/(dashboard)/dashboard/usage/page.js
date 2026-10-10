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

function rangeError(startDate, endDate) {
  if (!startDate || !endDate) return "Choose both Start and End.";
  const start = new Date(startDate); const end = new Date(endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "Choose valid Start and End dates.";
  if (start > end) return "Start must not be after End.";
  if (end - start > 60 * 86400000) return "Choose a range of 60 days or less.";
  return "";
}

function localDateTime(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

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
  const period = PERIODS.some(({ value }) => value === periodFromUrl) ? periodFromUrl : "today";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const customRange = Boolean(startDate || endDate);
  const urlRangeError = customRange ? rangeError(startDate, endDate) : "";
  const [formError, setFormError] = useState("");
  const scopeParams = new URLSearchParams({ period });
  if (customRange && !urlRangeError) {
    scopeParams.set("startDate", new Date(startDate).toISOString());
    scopeParams.set("endDate", new Date(endDate).toISOString());
  }
  const scopeQuery = scopeParams.toString();
  const modeFromUrl = searchParams.get("mode");
  const mode = VALUE_MODES.some(({ value }) => value === modeFromUrl) ? modeFromUrl : "costs";

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details", "keys"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handlePeriodChange = (value) => {
    setFormError("");
    const params = new URLSearchParams(searchParams);
    params.set("period", value);
    params.delete("startDate");
    params.delete("endDate");
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleRangeSubmit = (event) => {
    event.preventDefault();
    const start = event.currentTarget.elements.startDate.value;
    const end = event.currentTarget.elements.endDate.value;
    const error = rangeError(start, end);
    setFormError(error);
    if (error) return;
    const params = new URLSearchParams(searchParams);
    params.set("startDate", new Date(start).toISOString());
    params.set("endDate", new Date(end).toISOString());
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleModeChange = (value) => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", value);
    params.delete("sortBy");
    params.delete("sortOrder");
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <main className="flex min-w-0 flex-col gap-[var(--space-6)] px-1 sm:px-0">
      <header className="flex flex-wrap items-center justify-between gap-[var(--space-3)]"><div><h1 className="text-[length:var(--text-xl)] font-semibold">Usage</h1><p className="text-sm text-[var(--text-muted)]">Live updates</p></div></header>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "logs", label: "Logs" },
            { value: "details", label: "Details" },
            { value: "keys", label: "API keys" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        {["overview", "keys"].includes(activeTab) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end" aria-label="Usage scope controls">
            {activeTab === "overview" && <SegmentedControl options={VALUE_MODES} value={mode} onChange={handleModeChange} size="sm" className="w-full sm:w-auto" />}
            <SegmentedControl options={PERIODS} value={customRange ? "" : period} onChange={handlePeriodChange} size="sm" className="w-full sm:w-auto" />
          </div>
        )}
      </div>

      {["overview", "keys"].includes(activeTab) && <form key={`${startDate}|${endDate}`} onSubmit={handleRangeSubmit} className="flex min-w-0 flex-wrap items-end gap-3 border border-border bg-surface p-3" aria-label="Custom usage range">
        <div className="min-w-0 flex-1"><label htmlFor="usage-start" className="block text-sm font-medium">Start</label><input id="usage-start" name="startDate" type="datetime-local" defaultValue={localDateTime(startDate)} required aria-describedby="usage-range-help" className="mt-1 min-h-[var(--touch-h)] w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 text-base" /></div>
        <div className="min-w-0 flex-1"><label htmlFor="usage-end" className="block text-sm font-medium">End</label><input id="usage-end" name="endDate" type="datetime-local" defaultValue={localDateTime(endDate)} required aria-describedby="usage-range-help" className="mt-1 min-h-[var(--touch-h)] w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--surface)] px-3 text-base" /></div>
        <button type="submit" className="min-h-[var(--touch-h)] rounded-[var(--radius-control)] border border-[var(--input-border)] px-3 text-sm hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]">Apply range</button>
        <p id="usage-range-help" className="w-full text-sm text-[var(--text-muted)]">Local time · up to 60 days. {customRange ? "Custom range selected; choose a preset to reset." : "Choose Start and End, then apply."}</p>
        {(formError || urlRangeError) && <p role="alert" className="w-full text-sm text-[var(--danger)]">{formError || urlRangeError} Apply a valid range or choose a preset.</p>}
      </form>}
      {activeTab === "overview" && !urlRangeError && <UsageDashboard period={period} mode={mode} scopeQuery={scopeQuery} />}
      {activeTab === "logs" && <UsageLogs />}
      {activeTab === "details" && <RequestDetailsTab />}
      {activeTab === "keys" && !urlRangeError && <PerKeyUsageSection period={period} scopeQuery={scopeQuery} />}
    </main>
  );
}
