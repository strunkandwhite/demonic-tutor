import { listDrafts } from "@/core/db/queries";
import Link from "next/link";
import { ColorSymbols } from "./ColorSymbols";
import { FormatBadge } from "./FormatBadge";

function RankDisplay({ startRank, endRank }: { startRank: string | null; endRank: string | null }) {
  if (!startRank && !endRank) {
    return <span className="text-zinc-400 dark:text-zinc-500">-</span>;
  }
  if (!startRank) {
    return <span>{endRank}</span>;
  }
  if (!endRank) {
    return <span>{startRank}</span>;
  }
  return (
    <span>
      {startRank} → {endRank}
    </span>
  );
}

export async function DraftTable() {
  let drafts;
  try {
    drafts = await listDrafts({ limit: 20 });
  } catch {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Unable to load drafts
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-zinc-500 dark:text-zinc-400">
          No drafts yet. Run{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pnpm sync</code> to import
          from 17lands.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-left">
        <thead className="bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Date
            </th>
            <th className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Set
            </th>
            <th className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Format
            </th>
            <th className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Colors
            </th>
            <th className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Record
            </th>
            <th className="px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Rank
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {drafts.map((draft) => (
            <tr
              key={draft.id}
              className="bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/draft/${draft.id}`}
                  className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {new Date(draft.draft_date).toLocaleDateString()}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                {draft.set}
              </td>
              <td className="px-4 py-3">
                <FormatBadge format={draft.format} size="sm" />
              </td>
              <td className="px-4 py-3">
                <ColorSymbols colors={draft.colors} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    draft.wins === 7
                      ? "font-bold text-amber-500"
                      : "text-zinc-900 dark:text-zinc-100"
                  }
                >
                  {draft.wins}-{draft.losses}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                <RankDisplay startRank={draft.start_rank} endRank={draft.end_rank} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
