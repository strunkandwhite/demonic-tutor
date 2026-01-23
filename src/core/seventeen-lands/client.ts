/**
 * 17lands API client using Playwright for browser-based authentication.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
} from "./types";

const BASE_URL = "https://www.17lands.com";
const SESSION_FILE = ".seventeen-lands-session.json";

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
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

  constructor(email: string, password: string) {
    if (!email || !password) {
      throw new Error("17lands email and password are required");
    }
    this.email = email;
    this.password = password;
  }

  private async ensureBrowser(): Promise<Page> {
    if (this.page) return this.page;

    console.log("Launching browser...");
    this.browser = await chromium.launch({ headless: true });

    // Try to load existing session
    if (existsSync(SESSION_FILE)) {
      console.log("Loading saved session...");
      const sessionData = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
      this.context = await this.browser.newContext({ storageState: sessionData });
    } else {
      this.context = await this.browser.newContext();
    }

    this.page = await this.context.newPage();

    // Check if session is valid
    const isValid = await this.validateSession();
    if (!isValid) {
      console.log("Session invalid or expired, logging in...");
      await this.login();
    } else {
      console.log("Session valid");
    }

    return this.page;
  }

  private async validateSession(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" });
      const url = this.page.url();
      // If we're redirected to login, session is invalid
      return !url.includes("/login");
    } catch {
      return false;
    }
  }

  private async login(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    console.log("Navigating to login page...");
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // Fill login form
    console.log("Filling login form...");
    await this.page.fill('input[type="email"], input[name="email"]', this.email);
    await this.page.fill('input[type="password"], input[name="password"]', this.password);

    // Submit form
    await this.page.click('button[type="submit"]');

    // Wait for navigation away from login page
    await this.page.waitForURL((url) => !url.toString().includes("/login"), {
      timeout: 30000,
    });

    console.log("Login successful, saving session...");
    await this.saveSession();
  }

  private async saveSession(): Promise<void> {
    if (!this.context) return;
    const sessionData = await this.context.storageState();
    writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
  }

  private async fetchApi<T>(path: string, retryCount: number = 0): Promise<T> {
    const page = await this.ensureBrowser();

    try {
      const result = await page.evaluate(async (url: string) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            "accept": "application/json, text/plain, */*",
          },
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error(`AUTH_ERROR:${response.status}`);
        }

        if (response.status === 429) {
          throw new Error("RATE_LIMITED");
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      }, `${BASE_URL}${path}`);

      return result as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Handle auth errors - try re-login once
      if (message.includes("AUTH_ERROR") && retryCount === 0) {
        console.log("Session expired, re-authenticating...");
        await this.login();
        return this.fetchApi<T>(path, retryCount + 1);
      }

      // Handle rate limiting
      if (message === "RATE_LIMITED") {
        console.log("Rate limited, waiting 30 seconds...");
        await new Promise((r) => setTimeout(r, 30000));
        return this.fetchApi<T>(path, retryCount);
      }

      throw error;
    }
  }

  async getUserData(startDate: string, endDate: string): Promise<SeventeenLandsUserData> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return withRetry(() => this.fetchApi<SeventeenLandsUserData>(`/user/data?${params}`));
  }

  async getDraftDetail(draftId: string): Promise<SeventeenLandsDraftDetail> {
    const params = new URLSearchParams({ draft_id: draftId });
    return withRetry(() => this.fetchApi<SeventeenLandsDraftDetail>(`/data/draft?${params}`));
  }

  async close(): Promise<void> {
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
