import { getDraft, getCardStats } from "@/core/db/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

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

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">
            {draft.set} Draft - {new Date(draft.draft_date).toLocaleDateString()}
          </h1>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-gray-600 text-sm">Colors</div>
              <div className="text-xl font-mono">{draft.colors || "-"}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Record</div>
              <div className={`text-xl ${draft.wins === 7 ? "text-yellow-600 font-bold" : ""}`}>
                {draft.wins}-{draft.losses}
              </div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Start Rank</div>
              <div className="text-xl">{draft.start_rank || "-"}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">End Rank</div>
              <div className="text-xl">{draft.end_rank || "-"}</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {[0, 1, 2].map((packNum) => (
            <div key={packNum} className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b bg-gray-50">
                <h2 className="font-semibold">Pack {packNum + 1}</h2>
              </div>
              <div className="divide-y">
                {(packs[packNum] || []).map((pick) => (
                  <div key={pick.pick_number} className="p-4 flex items-center gap-4">
                    <div className="w-8 text-gray-500 text-sm">P{pick.pick_number + 1}</div>
                    <div className="flex-1 font-medium">{pick.card_name}</div>
                    <div className="text-gray-500 text-sm">
                      {JSON.parse(pick.available_cards).length} cards available
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
