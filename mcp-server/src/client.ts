const DEFAULT_BASE_URL = "https://aitcommunity.org";

export class AitClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  /**
   * Call a tRPC query procedure (GET request).
   */
  async query<T>(
    procedure: string,
    input?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`/api/trpc/${procedure}`, this.baseUrl);
    if (input) {
      url.searchParams.set("input", JSON.stringify({ json: input }));
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(
        `API error ${response.status}: ${await response.text()}`,
      );
    }
    const data = await response.json();
    return (data as Record<string, unknown> & { result: { data: { json: T } } })
      .result.data.json;
  }

  /**
   * Call a tRPC mutation procedure (POST request).
   */
  async mutate<T>(
    procedure: string,
    input?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`/api/trpc/${procedure}`, this.baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ json: input ?? {} }),
    });
    if (!response.ok) {
      throw new Error(
        `API error ${response.status}: ${await response.text()}`,
      );
    }
    const data = await response.json();
    return (data as Record<string, unknown> & { result: { data: { json: T } } })
      .result.data.json;
  }
}
