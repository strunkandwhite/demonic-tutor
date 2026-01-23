import { getMyStats } from "@/core/db/queries";

export async function StatsCards() {
  let stats;
  try {
    stats = await getMyStats({});
  } catch {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Unable to load stats
      </div>
    );
  }

  const winRate = (stats.win_rate * 100).toFixed(1);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {stats.total_drafts}
        </div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Drafts</div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{winRate}%</div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Win Rate</div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-2xl font-bold text-amber-500">{stats.trophies}</div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Trophies</div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {stats.total_wins}-{stats.total_losses}
        </div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Record</div>
      </div>
    </div>
  );
}
