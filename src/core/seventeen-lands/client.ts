/**
 * 17lands API client.
 */

import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
} from "./types";

const BASE_URL = "https://www.17lands.com";

export class SeventeenLandsClient {
  private session: string;

  constructor(session: string) {
    if (!session) {
      throw new Error("17lands session cookie is required");
    }
    this.session = session;
  }

  private async fetch<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "cookie": `logged_in=true; session=${this.session}`,
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "referer": "https://www.17lands.com/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    if (!response.ok) {
      throw new Error(`17lands API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getUserData(): Promise<SeventeenLandsUserData> {
    return this.fetch<SeventeenLandsUserData>("/data/user");
  }

  async getDraftDetail(draftId: string): Promise<SeventeenLandsDraftDetail> {
    const params = new URLSearchParams({ draft_id: draftId });
    return this.fetch<SeventeenLandsDraftDetail>(`/data/draft?${params}`);
  }
}

export function createSeventeenLandsClient(): SeventeenLandsClient {
  const session = process.env.SEVENTEEN_LANDS_SESSION;
  if (!session) {
    throw new Error("SEVENTEEN_LANDS_SESSION environment variable is not set");
  }
  return new SeventeenLandsClient(session);
}
