import { Chat } from "./components/Chat";
import { StatsCards } from "./components/StatsCards";
import { DraftTable } from "./components/DraftTable";
import { DraftDetail } from "./components/DraftDetail";
import { SetFilter } from "./components/SetFilter";
import { getDistinctSets, listDrafts } from "@/core/db/queries";
import { Suspense } from "react";

function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

interface HomeProps {
  searchParams: Promise<{ set?: string; draft?: string }>;
}

async function DraftSection({ set, draft }: { set?: string; draft?: string }) {
  const drafts = await listDrafts({ set, limit: 20 });

  if (draft) {
    return <DraftDetail draftId={draft} />;
  }

  return <DraftTable drafts={drafts} set={set} />;
}

export default async function Home({ searchParams }: HomeProps) {
  const { set, draft } = await searchParams;
  const sets = await getDistinctSets();
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demonic-tutor-art.jpg"
            alt="Demonic Tutor"
            className="h-16 w-20 rounded-lg object-cover"
          />
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Demonic Tutor</h1>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">Personal MTG draft analytics</p>
          </div>
        </header>

        {/* Chat */}
        <section className="mb-8">
          <Chat />
        </section>

        {/* Recent Drafts */}
        <section>
          {!draft && (
            <>
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
            </>
          )}
          <Suspense fallback={<LoadingSkeleton className="h-64" />}>
            <DraftSection set={set} draft={draft} />
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
          {" · "}
          Made by{" "}
          <a
            href="https://github.com/strunkandwhite"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            Jack
          </a>
        </footer>
      </div>
    </main>
  );
}
