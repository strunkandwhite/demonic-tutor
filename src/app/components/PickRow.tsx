"use client";

import { useState } from "react";
import { CardLink } from "./CardLink";
import { ManaSymbols } from "./ManaSymbols";
import type { CardData } from "@/core/db/queries";

interface PickRowProps {
  packNumber: number;
  pickNumber: number;
  cardName: string;
  availableCards: string[];
  cardData?: Record<string, CardData>;
}

function formatGihWr(gihWr: number | null | undefined): string {
  if (gihWr == null) return "-";
  return `${(gihWr * 100).toFixed(1)}%`;
}

function CardDisplay({
  name,
  cardData,
  isBold,
  size = "sm",
}: {
  name: string;
  cardData?: Record<string, CardData>;
  isBold?: boolean;
  size?: "sm" | "md";
}) {
  const data = cardData?.[name];
  const gihWr = formatGihWr(data?.gihWr);

  return (
    <span className={`inline-flex items-center gap-1 ${isBold ? "font-bold" : ""}`}>
      <ManaSymbols manaCost={data?.manaCost ?? null} size={size} />
      <span className="text-zinc-500 dark:text-zinc-400">[{gihWr}]</span>
      <CardLink name={name} />
    </span>
  );
}

export function PickRow({
  packNumber,
  pickNumber,
  cardName,
  availableCards,
  cardData,
}: PickRowProps) {
  const [expanded, setExpanded] = useState(false);

  // 17lands sometimes doesn't capture full P1P1 pack data
  const isIncompleteP1P1 = packNumber === 0 && pickNumber === 0 && availableCards.length <= 1;

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
        aria-label={
          isIncompleteP1P1
            ? `Pick ${pickNumber + 1}: ${cardName}.`
            : `Pick ${pickNumber + 1}: ${cardName}. ${availableCards.length} cards were available.`
        }
      >
        <div className="w-8 text-sm text-zinc-500 dark:text-zinc-400">P{pickNumber + 1}</div>
        <div className="flex-1 text-zinc-900 dark:text-zinc-100">
          <CardDisplay name={cardName} cardData={cardData} isBold size="md" />
        </div>
        {!isIncompleteP1P1 && (
          <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
            <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
            {availableCards.length} cards available
          </div>
        )}
      </div>
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="ml-8 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {availableCards.map((card, index) => (
              <span
                key={card}
                className={
                  card === cardName
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-300"
                }
              >
                <CardDisplay name={card} cardData={cardData} isBold={card === cardName} />
                {index < availableCards.length - 1 && ","}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
