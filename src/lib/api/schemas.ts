import { z } from "zod";

export const blockReasonSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().optional(),
  localIp: z.string().optional(),
});

export const logSchema = z.object({
  timestamp: z.string(),
  domain: z.string(),
  root: z.string().optional(),
  tracker: z.string().optional(),
  type: z.string().optional(),
  dnssec: z.boolean().optional(),
  encrypted: z.boolean(),
  protocol: z.string(),
  clientIp: z.string(),
  client: z.string().optional(),
  device: deviceSchema.optional(),
  status: z.enum(["default", "blocked", "allowed", "relayed", "error"]),
  reasons: z.array(blockReasonSchema),
});

export const logsResponseSchema = z.object({
  data: z.array(logSchema),
  meta: z.object({
    pagination: z.object({ cursor: z.string().nullable() }),
    stream: z.object({ id: z.string() }).optional(),
  }),
});

export const profileSchema = z.object({
  id: z.string(),
  fingerprint: z.string().optional(),
  role: z.string(),
  name: z.string(),
});

export const profilesResponseSchema = z.object({
  data: z.array(profileSchema),
});

export const statusAnalyticsSchema = z.object({
  status: z.string(),
  queries: z.number(),
});

export const domainAnalyticsSchema = z.object({
  domain: z.string(),
  root: z.string().optional(),
  tracker: z.string().optional(),
  queries: z.number(),
});

export const deviceAnalyticsSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().optional(),
  localIp: z.string().optional(),
  queries: z.number(),
});

export const gafamAnalyticsSchema = z.object({
  company: z.string(),
  queries: z.number(),
});

export const seriesDataSchema = z.object({
  status: z.string().optional(),
  type: z.number().optional(),
  name: z.string().optional(),
  queries: z.array(z.number()),
});

export const seriesResponseSchema = z.object({
  data: z.array(seriesDataSchema),
  meta: z.object({
    series: z.object({
      times: z.array(z.string()),
      interval: z.number(),
    }),
    pagination: z.object({ cursor: z.string().nullable() }),
  }),
});
