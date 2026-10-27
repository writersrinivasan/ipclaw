"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{error.message || "An unexpected error occurred."}</p>
      <button type="button" onClick={reset} className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white">
        Try again
      </button>
    </main>
  );
}
