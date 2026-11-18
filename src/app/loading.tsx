export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Overview</h1>
      <p role="status" aria-live="polite" className="mt-4">
        Loading overview. Please wait.
      </p>
    </main>
  );
}
