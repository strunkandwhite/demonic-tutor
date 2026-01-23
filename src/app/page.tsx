import { Chat } from "./components/Chat";
import { StatsCards } from "./components/StatsCards";
import { DraftTable } from "./components/DraftTable";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Demonic Tutor</h1>

        <Chat />

        <Suspense fallback={<div>Loading stats...</div>}>
          <StatsCards />
        </Suspense>

        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Drafts</h2>
          <Suspense fallback={<div>Loading drafts...</div>}>
            <DraftTable />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
