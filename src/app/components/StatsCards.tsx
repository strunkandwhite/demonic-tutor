import { getMyStats } from "@/core/db/queries";

export async function StatsCards() {
  let stats;
  try {
    stats = await getMyStats({});
  } catch {
    return <div className="text-gray-500">Unable to load stats</div>;
  }

  const winRate = (stats.win_rate * 100).toFixed(1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">{stats.total_drafts}</div>
        <div className="text-gray-600 text-sm">Drafts</div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">{winRate}%</div>
        <div className="text-gray-600 text-sm">Win Rate</div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">{stats.trophies}</div>
        <div className="text-gray-600 text-sm">Trophies</div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">
          {stats.total_wins}-{stats.total_losses}
        </div>
        <div className="text-gray-600 text-sm">Record</div>
      </div>
    </div>
  );
}
