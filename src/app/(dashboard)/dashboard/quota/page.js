import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";

export default function QuotaPage() {
  return (
    <main className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.02em]">Quota</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">Accounts are ordered A–Z. Switch to Expiring-first to sort by next reset.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted"><ShieldCheck aria-hidden="true" className="size-4 text-success" />Account identities are masked by default</div>
      </header>
      <Suspense fallback={<CardSkeleton />}>
        <ProviderLimits />
      </Suspense>
    </main>
  );
}
