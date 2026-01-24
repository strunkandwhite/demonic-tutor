/**
 * 17lands API client using Playwright for browser-based authentication.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
  SeventeenLandsGameList,
  SeventeenLandsEventDetails,
  SeventeenLandsDeck,
} from "./types";

const BASE_URL = "https://www.17lands.com";
const SESSION_FILE = ".seventeen-lands-session.json";
const MIN_API_DELAY_MS = 1000; // Minimum delay between API calls

function log(message: string): void {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 12);
  console.log(`[17lands ${timestamp}] ${message}`);
}

async function sleep(ms: number, reason?: string): Promise<void> {
  // Only log significant waits (retries, rate limits) not routine rate limiting
  if (reason) {
    log(`Waiting ${ms}ms (${reason})`);
  }
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
        log(`Attempt ${attempt} failed: ${lastError.message}`);
        await sleep(delay, "retry backoff");
      }
    }
  }

  throw lastError;
}

export class SeventeenLandsClient {
  private email: string;
  private password: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private lastApiCall: number = 0;

  constructor(email: string, password: string) {
    if (!email || !password) {
      throw new Error("17lands email and password are required");
    }
    this.email = email;
    this.password = password;
  }

  private async ensureBrowser(): Promise<Page> {
    if (this.page) return this.page;

    log("Launching browser...");
    this.browser = await chromium.launch({ headless: true });

    // Try to load existing session
    if (existsSync(SESSION_FILE)) {
      log("Loading saved session...");
      const sessionData = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
      this.context = await this.browser.newContext({ storageState: sessionData });
    } else {
      log("No saved session, creating new context");
      this.context = await this.browser.newContext();
    }

    this.page = await this.context.newPage();

    // Check if session is valid
    log("Validating session...");
    const isValid = await this.validateSession();
    if (!isValid) {
      log("Session invalid or expired, logging in...");
      await this.login();
    } else {
      log("Session valid");
    }

    return this.page;
  }

  private async validateSession(): Promise<boolean> {
    if (!this.page) return false;

    try {
      log("Navigating to /account to validate session...");
      await this.page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" });
      const url = this.page.url();
      log(`Current URL after navigation: ${url}`);
      // If we're redirected to login, session is invalid
      const valid = !url.includes("/login");
      log(`Session valid: ${valid}`);
      return valid;
    } catch (err) {
      log(`Session validation error: ${err}`);
      return false;
    }
  }

  private async login(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    log("Navigating to login page...");
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    log(`Login page loaded, URL: ${this.page.url()}`);

    // Fill login form
    log("Filling login form...");
    await this.page.fill('input[type="email"], input[name="email"]', this.email);
    await this.page.fill('input[type="password"], input[name="password"]', this.password);
    log("Form filled, submitting...");

    // Submit form
    await this.page.click('button[type="submit"]');

    // Wait for navigation away from login page
    log("Waiting for redirect after login...");
    await this.page.waitForURL((url) => !url.toString().includes("/login"), {
      timeout: 30000,
    });

    log(`Login successful, redirected to: ${this.page.url()}`);
    await this.saveSession();
  }

  private async saveSession(): Promise<void> {
    if (!this.context) return;
    log("Saving session to disk...");
    const sessionData = await this.context.storageState();
    writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
    log("Session saved");
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < MIN_API_DELAY_MS) {
      const waitTime = MIN_API_DELAY_MS - timeSinceLastCall;
      await sleep(waitTime);
    }
    this.lastApiCall = Date.now();
  }

  private async fetchApi<T>(path: string, retryCount: number = 0): Promise<T> {
    const page = await this.ensureBrowser();
    const fullUrl = `${BASE_URL}${path}`;

    // Enforce minimum delay between API calls
    await this.enforceRateLimit();

    log(`API REQUEST: ${path}`);
    const startTime = Date.now();

    try {
      const result = await page.evaluate(async (url: string) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            accept: "application/json, text/plain, */*",
          },
        });

        // Return both status and data for logging
        const data = response.ok ? await response.json() : null;
        return {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          data,
        };
      }, fullUrl);

      const elapsed = Date.now() - startTime;
      log(`API RESPONSE: ${result.status} ${result.statusText} (${elapsed}ms)`);

      if (result.status === 401 || result.status === 403) {
        throw new Error(`AUTH_ERROR:${result.status}`);
      }

      if (result.status === 429) {
        throw new Error("RATE_LIMITED");
      }

      if (!result.ok) {
        throw new Error(`API error: ${result.status} ${result.statusText}`);
      }

      return result.data as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const elapsed = Date.now() - startTime;
      log(`API ERROR: ${message} (${elapsed}ms)`);

      // Handle auth errors - try re-login once
      if (message.includes("AUTH_ERROR") && retryCount === 0) {
        log("Session expired, re-authenticating...");
        await this.login();
        await sleep(MIN_API_DELAY_MS, "post-auth delay");
        return this.fetchApi<T>(path, retryCount + 1);
      }

      // Handle rate limiting
      if (message === "RATE_LIMITED") {
        await sleep(30000, "rate limited by server");
        return this.fetchApi<T>(path, retryCount);
      }

      throw error;
    }
  }

  async getUserData(startDate: string, endDate: string): Promise<SeventeenLandsUserData> {
    log(`getUserData(${startDate}, ${endDate})`);
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return withRetry(() => this.fetchApi<SeventeenLandsUserData>(`/user/data?${params}`));
  }

  async getDraftDetail(draftId: string): Promise<SeventeenLandsDraftDetail> {
    log(`getDraftDetail(${draftId})`);
    const params = new URLSearchParams({ draft_id: draftId });
    return withRetry(() => this.fetchApi<SeventeenLandsDraftDetail>(`/data/draft?${params}`));
  }

  async getGames(): Promise<SeventeenLandsGameList> {
    log("getGames()");
    return withRetry(() => this.fetchApi<SeventeenLandsGameList>("/data/user_game_list"));
  }

  async getEventDetails(draftId: string): Promise<SeventeenLandsEventDetails> {
    log(`getEventDetails(${draftId})`);
    const params = new URLSearchParams({ draft_id: draftId });
    return withRetry(() =>
      this.fetchApi<SeventeenLandsEventDetails>(`/data/event_details?${params}`)
    );
  }

  async getDeck(draftId: string, deckIndex: number): Promise<SeventeenLandsDeck> {
    log(`getDeck(${draftId}, ${deckIndex})`);
    const params = new URLSearchParams({
      draft_id: draftId,
      deck_index: deckIndex.toString(),
    });
    return withRetry(() => this.fetchApi<SeventeenLandsDeck>(`/data/deck?${params}`));
  }

  async close(): Promise<void> {
    log("Closing browser...");
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    log("Browser closed");
  }
}

export function createSeventeenLandsClient(): SeventeenLandsClient {
  const email = process.env.SEVENTEEN_LANDS_EMAIL;
  const password = process.env.SEVENTEEN_LANDS_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEVENTEEN_LANDS_EMAIL and SEVENTEEN_LANDS_PASSWORD environment variables are required"
    );
  }

  return new SeventeenLandsClient(email, password);
}
