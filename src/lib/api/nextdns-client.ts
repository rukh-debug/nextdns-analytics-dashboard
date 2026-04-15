import type {
  NextDNSProfilesResponse,
  NextDNSLogsResponse,
  NextDNSAnalyticsResponse,
  NextDNSSeriesResponse,
  NextDNSStatusAnalytics,
  NextDNSDomainAnalytics,
  NextDNSReasonAnalytics,
  NextDNSGafamAnalytics,
  NextDNSLogSettings,
  NextDNSDevice,
  LogStatus,
} from "@/types/nextdns";

const BASE_URL = "https://api.nextdns.io";

interface NextDNSApiError {
  detail?: string;
  code?: string;
}

interface NextDNSApiErrorResponse {
  errors?: NextDNSApiError[];
}

class RateLimiter {
  private active = 0;
  private maxConcurrent: number;
  private lastRequestPerProfile = new Map<string, number>();
  private minProfileDelay: number;

  constructor(maxConcurrent = 5, minProfileDelay = 2000) {
    this.maxConcurrent = maxConcurrent;
    this.minProfileDelay = minProfileDelay;
  }

  async acquire(profileId?: string): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (profileId) {
      const last = this.lastRequestPerProfile.get(profileId) || 0;
      const elapsed = Date.now() - last;
      if (elapsed < this.minProfileDelay) {
        await new Promise((r) =>
          setTimeout(r, this.minProfileDelay - elapsed)
        );
      }
    }

    this.active++;
    if (profileId) {
      this.lastRequestPerProfile.set(profileId, Date.now());
    }
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

class CircuitBreaker {
  private failures = new Map<string, { count: number; until: number }>();

  recordFailure(profileId: string): boolean {
    const state = this.failures.get(profileId) || { count: 0, until: 0 };
    state.count++;
    if (state.count >= 5) {
      state.until = Date.now() + 5 * 60 * 1000;
    }
    this.failures.set(profileId, state);
    return state.count >= 5;
  }

  recordSuccess(profileId: string): void {
    this.failures.delete(profileId);
  }

  isOpen(profileId: string): boolean {
    const state = this.failures.get(profileId);
    if (!state) return false;
    if (Date.now() >= state.until) {
      state.count = 1;
      state.until = 0;
      return false;
    }
    return true;
  }
}

class ExponentialBackoff {
  private attempts = new Map<string, number>();

  getDelay(key: string): number {
    const attempt = this.attempts.get(key) || 0;
    const delays = [5000, 10000, 30000, 60000, 120000];
    return delays[Math.min(attempt, delays.length - 1)];
  }

  recordAttempt(key: string): void {
    this.attempts.set(key, (this.attempts.get(key) || 0) + 1);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export class NextDNSClient {
  private apiKey: string;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private backoff: ExponentialBackoff;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.rateLimiter = new RateLimiter();
    this.circuitBreaker = new CircuitBreaker();
    this.backoff = new ExponentialBackoff();
  }

  private async request<T>(
    path: string,
    profileId?: string,
    init?: RequestInit
  ): Promise<T> {
    if (profileId && this.circuitBreaker.isOpen(profileId)) {
      throw new Error(
        `Circuit breaker open for profile ${profileId}`
      );
    }

    await this.rateLimiter.acquire(profileId);
    const backoffKey = `${profileId || "global"}:${path}`;

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          "X-Api-Key": this.apiKey,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      if (res.status === 429 || res.status >= 500) {
        this.backoff.recordAttempt(backoffKey);
        if (profileId) {
          const tripped = this.circuitBreaker.recordFailure(profileId);
          if (tripped) {
            throw new Error(
              `Circuit breaker tripped for profile ${profileId}`
            );
          }
        }
        const delay = this.backoff.getDelay(backoffKey);
        await new Promise((r) => setTimeout(r, delay));
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      if (profileId) {
        this.circuitBreaker.recordSuccess(profileId);
      }
      this.backoff.reset(backoffKey);

      const data = (await res.json()) as T & NextDNSApiErrorResponse;
      if (data.errors) {
        throw new Error(
          `API Error: ${data.errors
            .map((error) => error.detail || error.code || "unknown")
            .join(", ")}`
        );
      }

      return data;
    } finally {
      this.rateLimiter.release();
    }
  }

  async getProfiles(): Promise<NextDNSProfilesResponse> {
    return this.request<NextDNSProfilesResponse>("/profiles");
  }

  async getLogs(
    profileId: string,
    params?: {
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
      sort?: "asc" | "desc";
      device?: string;
      status?: LogStatus;
      search?: string;
      raw?: boolean;
    }
  ): Promise<NextDNSLogsResponse> {
    const sp = new URLSearchParams();
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.cursor) sp.set("cursor", params.cursor);
    if (params?.sort) sp.set("sort", params.sort);
    if (params?.device) sp.set("device", params.device);
    if (params?.status) sp.set("status", params.status);
    if (params?.search) sp.set("search", params.search);
    if (params?.raw) sp.set("raw", "1");
    const qs = sp.toString();
    return this.request<NextDNSLogsResponse>(
      `/profiles/${profileId}/logs${qs ? `?${qs}` : ""}`,
      profileId
    );
  }

  async getAnalytics<T>(
    profileId: string,
    type: string,
    params?: Record<string, string>
  ): Promise<NextDNSAnalyticsResponse<T>> {
    const sp = new URLSearchParams(params);
    const qs = sp.toString();
    return this.request<NextDNSAnalyticsResponse<T>>(
      `/profiles/${profileId}/analytics/${type}${qs ? `?${qs}` : ""}`,
      profileId
    );
  }

  async getStatusAnalytics(
    profileId: string,
    params?: Record<string, string>
  ) {
    return this.getAnalytics<NextDNSStatusAnalytics>(
      profileId,
      "status",
      params
    );
  }

  async getDomainAnalytics(
    profileId: string,
    params?: Record<string, string>
  ) {
    return this.getAnalytics<NextDNSDomainAnalytics>(
      profileId,
      "domains",
      params
    );
  }

  async getReasonAnalytics(
    profileId: string,
    params?: Record<string, string>
  ) {
    return this.getAnalytics<NextDNSReasonAnalytics>(
      profileId,
      "reasons",
      params
    );
  }

  async getDeviceAnalytics(
    profileId: string,
    params?: Record<string, string>
  ) {
    return this.getAnalytics<NextDNSDevice>(
      profileId,
      "devices",
      params
    );
  }

  async getGafamAnalytics(
    profileId: string,
    params?: Record<string, string>
  ) {
    return this.getAnalytics<NextDNSGafamAnalytics>(
      profileId,
      "destinations",
      { type: "gafam", ...params }
    );
  }

  async getSeries(
    profileId: string,
    type: string,
    params?: {
      from?: string;
      to?: string;
      interval?: number;
      alignment?: string;
      timezone?: string;
    }
  ): Promise<NextDNSSeriesResponse> {
    const sp = new URLSearchParams();
    if (params?.from) sp.set("from", params.from);
    if (params?.to) sp.set("to", params.to);
    if (params?.interval) sp.set("interval", String(params.interval));
    if (params?.alignment) sp.set("alignment", params.alignment);
    if (params?.timezone) sp.set("timezone", params.timezone);
    const qs = sp.toString();
    return this.request<NextDNSSeriesResponse>(
      `/profiles/${profileId}/analytics/${type};series${qs ? `?${qs}` : ""}`,
      profileId
    );
  }

  async getLogSettings(
    profileId: string
  ): Promise<{ data: NextDNSLogSettings }> {
    return this.request<{ data: NextDNSLogSettings }>(
      `/profiles/${profileId}/settings/logs`,
      profileId
    );
  }

  getStreamUrl(profileId: string): string {
    return `${BASE_URL}/profiles/${profileId}/logs/stream`;
  }
}

export function createClient(apiKey: string): NextDNSClient {
  return new NextDNSClient(apiKey);
}
