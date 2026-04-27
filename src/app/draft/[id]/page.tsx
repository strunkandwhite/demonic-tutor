import { getDraftWithCardData } from "@/core/db/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/app/components/Chat";
import { DraftDetailBody } from "@/app/components/DraftDetailBody";
import { FormatBadge } from "@/app/components/FormatBadge";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DraftPage({ params }: Props) {
  const { id } = await params;
  const { draft, picks, cardData, games } = await getDraftWithCardData(id);

  if (!draft) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {draft.set} Draft - {new Date(draft.draft_date).toLocaleDateString()}
          </h1>
          <FormatBadge format={draft.format} />
        </div>

        <section className="mb-8">
          <Chat draftId={id} />
        </section>

        <DraftDetailBody draft={draft} picks={picks} games={games} cardData={cardData} />

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
