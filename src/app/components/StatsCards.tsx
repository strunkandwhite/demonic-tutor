import { getMyStats } from "@/core/db/queries";

interface StatsCardsProps {
  set?: string;
}

export async function StatsCards({ set }: StatsCardsProps) {
  let stats;
  try {
    stats = await getMyStats({ set });
  } catch {
    return <div className="text-sm text-zinc-400 dark:text-zinc-500">Unable to load stats</div>;
  }

  const winRate = (stats.win_rate * 100).toFixed(1);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
      <span>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{stats.total_drafts}</span>{" "}
        drafts
      </span>
      <span>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{winRate}%</span> win rate
      </span>
      <span>
        <span className="font-medium text-amber-600 dark:text-amber-500">{stats.trophies}</span>{" "}
        {stats.trophies === 1 ? "trophy" : "trophies"}
      </span>
      <span>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {stats.total_wins}-{stats.total_losses}
        </span>{" "}
        record
      </span>
    </div>
  );
}
