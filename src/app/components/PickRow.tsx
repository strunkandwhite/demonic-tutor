"use client";

import { useState } from "react";
import { CardLink } from "./CardLink";

interface PickRowProps {
  pickNumber: number;
  cardName: string;
  availableCards: string[];
}

export function PickRow({ pickNumber, cardName, availableCards }: PickRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white transition-colors dark:bg-zinc-900">
      <div
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="flex cursor-pointer items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="w-8 text-sm text-zinc-500 dark:text-zinc-400">P{pickNumber + 1}</div>
        <div className="flex-1 font-medium text-zinc-900 dark:text-zinc-100">
          <CardLink name={cardName} />
        </div>
        <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
          {availableCards.length} cards available
        </div>
      </div>
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="ml-8 flex flex-wrap gap-x-2 gap-y-1 text-sm">
            {availableCards.map((card, i) => (
              <span
                key={i}
                className={
                  card === cardName
                    ? "font-bold text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-300"
                }
              >
                <CardLink name={card} />
                {i < availableCards.length - 1 && ","}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
