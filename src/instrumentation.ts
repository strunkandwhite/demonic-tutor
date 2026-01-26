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

  // Warn about optional security variables
  if (!process.env.API_SECRET) {
    console.warn("Warning: API_SECRET not set - API endpoints are unauthenticated");
  }
}
