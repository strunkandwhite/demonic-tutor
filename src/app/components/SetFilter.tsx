"use client";

import { useRouter } from "next/navigation";

interface SetFilterProps {
  sets: string[];
  currentSet?: string;
}

export function SetFilter({ sets, currentSet }: SetFilterProps) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const url = new URL(window.location.href);

    if (value) {
      url.searchParams.set("set", value);
    } else {
      url.searchParams.delete("set");
    }

    router.replace(url.pathname + url.search);
  }

  return (
    <select
      value={currentSet ?? ""}
      onChange={handleChange}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
    >
      <option value="">All Sets</option>
      {sets.map((set) => (
        <option key={set} value={set}>
          {set}
        </option>
      ))}
    </select>
  );
}
