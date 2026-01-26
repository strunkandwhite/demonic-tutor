import { getDraft } from "@/core/db/queries";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ColorSymbols } from "@/app/components/ColorSymbols";
import { FormatBadge } from "@/app/components/FormatBadge";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DraftPage({ params }: Props) {
  const { id } = await params;
  const { draft, picks } = await getDraft(id);

  if (!draft) {
    notFound();
  }

  // Group picks by pack
  const packs: Record<number, typeof picks> = {};
  for (const pick of picks) {
    if (!packs[pick.pack_number]) {
      packs[pick.pack_number] = [];
    }
    packs[pick.pack_number].push(pick);
  }

  const hasRankInfo = draft.start_rank || draft.end_rank;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
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

        {/* Stats Card */}
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <div
            className={`grid gap-4 ${hasRankInfo ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"}`}
          >
            <div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">Colors</div>
              <div className="mt-1">
                <ColorSymbols colors={draft.colors} />
              </div>
            </div>
            <div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">Record</div>
              <div
                className={`text-xl ${draft.wins === 7 ? "font-bold text-amber-500" : "text-zinc-900 dark:text-zinc-100"}`}
              >
                {draft.wins}-{draft.losses}
              </div>
            </div>
            {hasRankInfo && (
              <>
                <div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">Start Rank</div>
                  <div className="text-xl text-zinc-900 dark:text-zinc-100">
                    {draft.start_rank || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">End Rank</div>
                  <div className="text-xl text-zinc-900 dark:text-zinc-100">
                    {draft.end_rank || "-"}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Packs */}
        <div className="space-y-6">
          {[0, 1, 2].map((packNum) => (
            <div
              key={packNum}
              className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
            >
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Pack {packNum + 1}
                </h2>
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {(packs[packNum] || []).map((pick) => (
                  <div
                    key={pick.pick_number}
                    className="flex items-center gap-4 bg-white p-4 transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    <div className="w-8 text-sm text-zinc-500 dark:text-zinc-400">
                      P{pick.pick_number + 1}
                    </div>
                    <div className="flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                      {pick.card_name}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {JSON.parse(pick.available_cards).length} cards available
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

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
