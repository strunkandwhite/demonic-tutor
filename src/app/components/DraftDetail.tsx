"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColorSymbols } from "./ColorSymbols";
import { FormatBadge } from "./FormatBadge";
import { PickRow } from "./PickRow";
import type { Draft, DraftPick, Game } from "@/core/db/schema";
import type { CardData } from "@/core/db/queries";

interface DraftDetailProps {
  draftId: string;
}

interface DraftResponse {
  draft: Draft;
  picks: DraftPick[];
  cardData: Record<string, CardData>;
  games: Game[];
}

export function DraftDetail({ draftId }: DraftDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchDraft = async () => {
      try {
        const res = await fetch(`/api/draft/${draftId}`);
        if (res.status === 404) throw new Error("Draft not found");
        if (!res.ok) throw new Error("Failed to load draft");
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    };

    setLoading(true);
    setError(null);
    setData(null);
    fetchDraft();

    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const goBack = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("draft");
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <div className="animate-pulse text-zinc-500 dark:text-zinc-400">Loading draft...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-red-500">{error || "Draft not found"}</p>
        <button onClick={goBack} className="mt-4 text-blue-600 hover:underline dark:text-blue-400">
          Back to drafts
        </button>
      </div>
    );
  }

  const { draft, picks, cardData, games } = data;

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
    <div>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <button onClick={goBack} className="text-blue-600 hover:underline dark:text-blue-400">
          Recent Drafts
        </button>
        <span className="mx-2 text-zinc-400">&gt;</span>
        <span className="text-zinc-700 dark:text-zinc-300">
          {draft.set} Draft {new Date(draft.draft_date).toLocaleDateString()}
        </span>
      </nav>

      {/* Stats Card */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {draft.set} Draft - {new Date(draft.draft_date).toLocaleDateString()}
          </h2>
          <FormatBadge format={draft.format} />
        </div>
        <div className={`grid gap-4 ${hasRankInfo ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"}`}>
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

        {/* Game Results */}
        {games.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <div className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">Games</div>
            <div className="flex flex-wrap gap-2">
              {games.map((game) => {
                const pill = (
                  <span
                    key={game.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      game.won
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    }`}
                  >
                    {game.won ? "W" : "L"}
                    <span className="text-[10px] opacity-70">{game.on_play ? "P" : "D"}</span>
                  </span>
                );

                if (game.replay_link) {
                  return (
                    <a
                      key={game.id}
                      href={`https://www.17lands.com${game.replay_link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-opacity hover:opacity-80"
                      title={`Game ${game.game_number + 1}${game.turns ? ` (${game.turns} turns)` : ""} — View on 17lands`}
                    >
                      {pill}
                    </a>
                  );
                }

                return pill;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Packs */}
      <div className="space-y-6">
        {[0, 1, 2].map((packNum) => (
          <div
            key={packNum}
            className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
          >
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Pack {packNum + 1}</h3>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {(packs[packNum] || []).map((pick) => (
                <PickRow
                  key={pick.pick_number}
                  packNumber={pick.pack_number}
                  pickNumber={pick.pick_number}
                  cardName={pick.card_name}
                  availableCards={pick.available_cards}
                  cardData={cardData}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
