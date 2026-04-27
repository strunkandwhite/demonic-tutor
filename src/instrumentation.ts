/**
 * Next.js instrumentation file - runs at server startup.
 * Used to validate environment variables before accepting requests.
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateEnvironment();
  }
}

function validateEnvironment() {
  const required = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "OPENAI_API_KEY"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variables:", missing.join(", "));
    console.error("Please set these in your .env.local file");
    process.exit(1);
  }

  // API_SECRET: fail closed in production (Vercel or otherwise), warn in dev/preview.
  checkApiSecret(process.env);
}

/**
 * Throws if API_SECRET is missing in production. Otherwise warns.
 *
 * Production detection:
 * - On Vercel deployments, gate on VERCEL_ENV === "production"
 *   (NODE_ENV is also "production" during `next build`, which would
 *   fail every Vercel build before env propagation — don't gate on it
 *   when we know we're on Vercel).
 * - For non-Vercel deploys, fall back to NODE_ENV === "production".
 */
export function checkApiSecret(env: Record<string, string | undefined>): void {
  if (env.API_SECRET) return;

  const isVercelProduction = env.VERCEL_ENV === "production";
  const isNonVercelProduction = !env.VERCEL_ENV && env.NODE_ENV === "production";

  if (isVercelProduction || isNonVercelProduction) {
    throw new Error(
      "API_SECRET must be set in production - refusing to start with unauthenticated API endpoints"
    );
  }

  console.warn("Warning: API_SECRET not set - API endpoints are unauthenticated");
}
