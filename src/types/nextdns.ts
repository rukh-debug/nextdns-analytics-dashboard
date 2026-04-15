export interface NextDNSProfile {
  id: string;
  fingerprint?: string;
  role: string;
  name: string;
}

export interface NextDNSDevice {
  id: string;
  name: string;
  model?: string;
  localIp?: string;
  queries: number;
}

export interface NextDNSLog {
  timestamp: string;
  domain: string;
  root?: string;
  tracker?: string;
  type?: string;
  dnssec?: boolean;
  encrypted: boolean;
  protocol: string;
  clientIp: string;
  client?: string;
  device?: {
    id: string;
    name: string;
    model?: string;
    localIp?: string;
  };
  status: "default" | "blocked" | "allowed" | "relayed" | "error";
  reasons: NextDNSBlockReason[];
}

export interface NextDNSBlockReason {
  id: string;
  name: string;
}

export interface NextDNSStatusAnalytics {
  status: string;
  queries: number;
}

export interface NextDNSDomainAnalytics {
  domain: string;
  root?: string;
  tracker?: string;
  queries: number;
}

export interface NextDNSReasonAnalytics {
  id: string;
  name: string;
  queries: number;
}

export interface NextDNSGafamAnalytics {
  company: string;
  queries: number;
}

export interface NextDNSSeriesData {
  status?: string;
  type?: number;
  name?: string;
  queries: number[];
}

export interface NextDNSSeriesMeta {
  series: {
    times: string[];
    interval: number;
  };
  pagination: {
    cursor: string | null;
  };
}

export interface NextDNSLogsResponse {
  data: NextDNSLog[];
  meta: {
    pagination: {
      cursor: string | null;
    };
    stream?: {
      id: string;
    };
  };
}

export interface NextDNSAnalyticsResponse<T> {
  data: T[];
  meta: {
    pagination: {
      cursor: string | null;
    };
  };
}

export interface NextDNSSeriesResponse {
  data: NextDNSSeriesData[];
  meta: NextDNSSeriesMeta;
}

export interface NextDNSProfilesResponse {
  data: NextDNSProfile[];
}

export interface NextDNSLogSettings {
  enabled: boolean;
  drop: {
    ip: boolean;
    domain: boolean;
  };
  retention: number;
  location: string;
}

export type LogStatus = "default" | "blocked" | "allowed" | "relayed" | "error";
