import { Suspense } from "react";
import { Activity, ShieldCheck, WalletCards } from "lucide-react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";

const LEDGER_BANDS = [
  {
    label: "Available",
    description: "Capacity ready for requests",
    tone: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  },
  {
    label: "Watch",
    description: "Usage nearing its limit",
    tone: "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  },
  {
    label: "Exhausted",
    description: "No remaining capacity",
    tone: "border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300",
  },
];

export default function QuotaPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <WalletCards aria-hidden="true" className="size-4" />
            Account capacity
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Quota ledger</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Review provider capacity and manage account lifecycles without exposing account identifiers.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Account emails remain masked
        </div>
      </header>

      <section aria-labelledby="ledger-bands-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="ledger-bands-heading" className="text-sm font-semibold">
            Ledger bands
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {LEDGER_BANDS.map((band) => (
            <div key={band.label} className={`rounded-xl border px-4 py-3 ${band.tone}`}>
              <p className="text-sm font-semibold">{band.label}</p>
              <p className="mt-1 text-xs opacity-80">{band.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="accounts-heading" className="space-y-3">
        <div>
          <h2 id="accounts-heading" className="text-lg font-semibold tracking-tight">
            Provider accounts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lifecycle actions and consequential-action confirmations remain available on each account card.
          </p>
        </div>
        <Suspense fallback={<CardSkeleton />}>
          <ProviderLimits />
        </Suspense>
      </section>
    </main>
  );
}
