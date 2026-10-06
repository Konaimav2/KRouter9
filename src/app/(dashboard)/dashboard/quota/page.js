import { Suspense } from "react";
import { Clock3, ShieldCheck } from "lucide-react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";

export default function QuotaPage() {
  return (
    <main className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted"><Clock3 aria-hidden="true" className="size-4" />Global reset runway</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Quota</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">Accounts follow one next-reset order. Filters preserve that order, and lifecycle actions stay with each runway stop.</p>
        </div>
        <div className="flex items-center gap-2 border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted"><ShieldCheck aria-hidden="true" className="size-4" />Account emails are masked by default</div>
      </header>
      <Suspense fallback={<CardSkeleton />}>
        <ProviderLimits sort="expiring" />
      </Suspense>
    </main>
  );
}
