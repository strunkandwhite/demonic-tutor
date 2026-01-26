import { Chat } from "./components/Chat";
import { StatsCards } from "./components/StatsCards";
import { DraftTable } from "./components/DraftTable";
import { SetFilter } from "./components/SetFilter";
import { getDistinctSets } from "@/core/db/queries";
import { Suspense } from "react";

function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

interface HomeProps {
  searchParams: Promise<{ set?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { set } = await searchParams;
  const sets = await getDistinctSets();
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

        {/* Recent Drafts */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Recent Drafts
            </h2>
            <SetFilter sets={sets} currentSet={set} />
          </div>
          <div className="mb-4">
            <Suspense fallback={<LoadingSkeleton className="h-5 w-64" />}>
              <StatsCards set={set} />
            </Suspense>
          </div>
          <Suspense fallback={<LoadingSkeleton className="h-64" />}>
            <DraftTable set={set} />
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
