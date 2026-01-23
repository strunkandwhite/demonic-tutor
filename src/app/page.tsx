import { Chat } from "./components/Chat";
import { StatsCards } from "./components/StatsCards";
import { DraftTable } from "./components/DraftTable";
import { Suspense } from "react";

function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Demonic Tutor</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Personal MTG draft analytics</p>
        </header>

        {/* Chat */}
        <section className="mb-8">
          <Chat />
        </section>

        {/* Stats */}
        <section className="mb-8">
          <Suspense fallback={<LoadingSkeleton className="h-24" />}>
            <StatsCards />
          </Suspense>
        </section>

        {/* Recent Drafts */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Drafts
          </h2>
          <Suspense fallback={<LoadingSkeleton className="h-64" />}>
            <DraftTable />
          </Suspense>
        </section>

        {/* Footer */}
        <footer className="mt-12 pb-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
          Data from{" "}
          <a
            href="https://www.17lands.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            17lands
          </a>
        </footer>
      </div>
    </main>
  );
}
