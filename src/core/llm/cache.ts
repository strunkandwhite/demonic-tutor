/**
 * Request-scoped cache for LLM tool results.
 * Prevents duplicate database queries within a single conversation turn.
 */

export class ToolResultCache {
  private cache = new Map<string, string>();

  /**
   * Generate a cache key from tool name and arguments.
   */
  private makeKey(name: string, args: Record<string, unknown>): string {
    const sortedArgs = Object.keys(args)
      .sort()
      .map((k) => `${k}:${JSON.stringify(args[k])}`)
      .join("|");
    return `${name}::${sortedArgs}`;
  }

  /**
   * Get a cached result if available.
   */
  get(name: string, args: Record<string, unknown>): string | undefined {
    return this.cache.get(this.makeKey(name, args));
  }

  /**
   * Cache a tool result.
   */
  set(name: string, args: Record<string, unknown>, result: string): void {
    this.cache.set(this.makeKey(name, args), result);
  }
}
