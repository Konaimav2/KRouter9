import Link from "next/link";

export const metadata = {
  title: "Page not found | KRouter9",
};

// Root 404. Next's built-in page ignores the app theme class and rendered
// black-on-dark; this one renders inside the root layout and uses the theme
// tokens from globals.css, so both themes keep text at >= 4.5:1.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-12 text-[var(--color-text)]">
      <section className="w-full max-w-md rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <p className="font-mono text-sm font-semibold text-[var(--color-text-muted)]">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">Page not found</h1>
        <p className="mt-2 text-sm leading-6 break-words text-[var(--color-text-muted)]">
          This address does not match a dashboard page. Check the URL or go back to the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[var(--button-radius)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
