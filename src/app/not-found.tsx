import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold text-zinc-900 dark:text-zinc-100">404</h1>
        <p className="mb-4 text-zinc-600 dark:text-zinc-400">Page not found</p>
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
