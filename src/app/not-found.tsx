import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/" className="mt-4 inline-block text-[var(--accent)] underline">Go to IPC Navigator</Link>
    </main>
  );
}
