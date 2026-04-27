"use client";

import { memo, useState } from "react";
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
      <CardLink name={name} imageUrl={data?.imageUrl} />
    </span>
  );
}

function PickRowImpl({ packNumber, pickNumber, cardName, availableCards, cardData }: PickRowProps) {
  const [expanded, setExpanded] = useState(false);

  // 17lands sometimes doesn't capture full P1P1 pack data (returns only the picked card)
  const isIncompleteP1P1 = packNumber === 0 && pickNumber === 0 && availableCards.length <= 1;
  const canExpand = !isIncompleteP1P1;

  const handleClick = canExpand ? () => setExpanded(!expanded) : undefined;
  const handleKeyDown = canExpand
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }
    : undefined;

  return (
    <div className="bg-white transition-colors dark:bg-zinc-900">
      <div
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-4 p-4 ${canExpand ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800" : ""}`}
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={`Pick ${pickNumber + 1}: ${cardName}${canExpand ? `. ${availableCards.length} cards were available.` : ""}`}
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
      {canExpand && expanded && (
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

/**
 * Memoize so siblings don't re-render when one row toggles its expanded state.
 * Props are mostly primitives plus a stable cardData reference (constructed
 * once per render in the SSR page).
 */
export const PickRow = memo(PickRowImpl);
