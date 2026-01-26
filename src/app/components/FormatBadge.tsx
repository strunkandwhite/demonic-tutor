interface FormatBadgeProps {
  format: string;
  size?: "sm" | "md";
}

export function FormatBadge({ format, size = "md" }: FormatBadgeProps) {
  const isBo3 = format === "TradDraft";
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center rounded font-medium ${sizeClasses} ${
        isBo3
          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
      }`}
    >
      {isBo3 ? "Bo3" : "Bo1"}
    </span>
  );
}
