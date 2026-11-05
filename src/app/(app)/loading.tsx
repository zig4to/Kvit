// Okostje med nalaganjem meseca.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="mx-auto h-7 w-40 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="h-48 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="h-32 rounded-xl bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}
