import { listDrafts } from "@/core/db/queries";
import Link from "next/link";

export async function DraftTable() {
  let drafts;
  try {
    drafts = await listDrafts({ limit: 20 });
  } catch {
    return <div className="text-gray-500">Unable to load drafts</div>;
  }

  if (drafts.length === 0) {
    return (
      <div className="text-gray-500 p-4">
        No drafts yet. Run <code>pnpm sync</code> to import from 17lands.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Set</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Colors</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Record</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Rank</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {drafts.map((draft) => (
            <tr key={draft.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Link href={`/draft/${draft.id}`} className="text-blue-600 hover:underline">
                  {new Date(draft.draft_date).toLocaleDateString()}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-sm">{draft.set}</td>
              <td className="px-4 py-3 font-mono text-sm">{draft.colors || "-"}</td>
              <td className="px-4 py-3">
                <span className={draft.wins === 7 ? "text-yellow-600 font-bold" : ""}>
                  {draft.wins}-{draft.losses}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {draft.start_rank} → {draft.end_rank}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
