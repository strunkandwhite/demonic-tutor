"use client";

import { useState, useRef } from "react";
import { useCardImage } from "../hooks/useCardImage";

interface CardLinkProps {
  name: string;
}

export function CardLink({ name }: CardLinkProps) {
  const imageUrl = useCardImage(name);
  const [showPreview, setShowPreview] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const updatePosition = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // Position image to the right of the text, clamped to viewport
      const left = Math.min(rect.right + 8, window.innerWidth - 340);
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - 480));
      setPosition({ top, left });
    }
  };

  const show = () => {
    updatePosition();
    setShowPreview(true);
  };

  const hide = () => setShowPreview(false);

  return (
    <span
      ref={ref}
      tabIndex={0}
      className="cursor-help underline decoration-dotted decoration-zinc-400 dark:decoration-zinc-500"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {name}
      {showPreview && imageUrl && (
        <span className="fixed z-50" style={{ top: position.top, left: position.left }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            width={320}
            height={448}
            className="rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
            onError={hide}
          />
        </span>
      )}
    </span>
  );
}
