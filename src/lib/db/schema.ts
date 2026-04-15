import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  index,
  uniqueIndex,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fingerprint: text("fingerprint"),
  apiKey: text("api_key").notNull(),
  isActive: boolean("is_active").default(false),
  lastIngestedAt: text("last_ingested_at"),
  lastStreamId: text("last_stream_id"),
  bootstrapStatus: text("bootstrap_status", {
    enum: ["idle", "running", "done", "failed"],
  }).default("idle"),
  bootstrapCursor: text("bootstrap_cursor"),
  bootstrapWindowStart: text("bootstrap_window_start"),
  bootstrapWindowEnd: text("bootstrap_window_end"),
  bootstrapCutoffAt: text("bootstrap_cutoff_at"),
  bootstrapCompletedAt: text("bootstrap_completed_at"),
  lastSuccessfulPollAt: text("last_successful_poll_at"),
  lastSuccessfulStreamAt: text("last_successful_stream_at"),
  createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`now()`),
});

export const groups = pgTable("groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
});

// Keep backward-compatible alias for imports that haven't migrated yet
export const persons = groups;

export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  model: text("model"),
  localIp: text("local_ip"),
  groupId: text("group_id").references(() => groups.id, {
    onDelete: "set null",
  }),
  lastSeenAt: text("last_seen_at"),
  createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`now()`),
});

export const dnsLogs = pgTable(
  "dns_logs",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id),
    eventHash: text("event_hash").notNull(),
    deviceId: text("device_id").references(() => devices.id),
    deviceName: text("device_name"),
    deviceModel: text("device_model"),
    deviceLocalIp: text("device_local_ip"),
    timestamp: text("timestamp").notNull(),
    domain: text("domain").notNull(),
    rootDomain: text("root_domain"),
    tracker: text("tracker"),
    status: text("status", {
      enum: ["default", "blocked", "allowed", "relayed", "error"],
    }).notNull(),
    queryType: text("query_type"),
    dnssec: boolean("dnssec"),
    encrypted: boolean("encrypted").default(false),
    protocol: text("protocol"),
    clientIp: text("client_ip"),
    clientName: text("client_name"),
    isFlagged: boolean("is_flagged").default(false),
    flagReason: text("flag_reason"),
    reasons: jsonb("reasons"),
    ingestedAt: timestamp("ingested_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("idx_dns_logs_event_hash").on(table.profileId, table.eventHash),
    index("idx_dns_logs_timestamp").on(table.timestamp),
    index("idx_dns_logs_profile_timestamp").on(
      table.profileId,
      table.timestamp
    ),
    index("idx_dns_logs_domain").on(table.domain),
    index("idx_dns_logs_device").on(table.deviceId),
    index("idx_dns_logs_status").on(table.status),
    index("idx_dns_logs_flagged").on(table.isFlagged),
  ]
);

export const alertTags = pgTable(
  "alert_tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("idx_alert_tags_name").on(table.name),
    uniqueIndex("idx_alert_tags_slug").on(table.slug),
  ]
);

export const tags = alertTags;

export const domainLists = pgTable(
  "domain_lists",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    tagId: text("tag_id")
      .notNull()
      .references(() => alertTags.id),
    sourceType: text("source_type", { enum: ["builtin", "github_raw"] }).notNull(),
    sourceUrl: text("source_url"),
    isSystem: boolean("is_system").default(false),
    isActive: boolean("is_active").default(true),
    lastFetchedAt: text("last_fetched_at"),
    lastFetchStatus: text("last_fetch_status", {
      enum: ["idle", "success", "error"],
    }).default("idle"),
    lastFetchError: text("last_fetch_error"),
    entryCount: integer("entry_count").default(0),
    createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [index("idx_domain_lists_tag_id").on(table.tagId)]
);

export const domainListEntries = pgTable(
  "domain_list_entries",
  {
    id: serial("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => domainLists.id),
    domain: text("domain").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("idx_domain_list_entries_unique").on(table.listId, table.domain),
    index("idx_domain_list_entries_domain").on(table.domain),
  ]
);

export const dnsLogTags = pgTable(
  "dns_log_tags",
  {
    id: serial("id").primaryKey(),
    logId: integer("log_id")
      .notNull()
      .references(() => dnsLogs.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => alertTags.id),
    listId: text("list_id")
      .notNull()
      .references(() => domainLists.id),
    matchedDomain: text("matched_domain").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("idx_dns_log_tags_unique").on(
      table.logId,
      table.tagId,
      table.listId,
      table.matchedDomain
    ),
    index("idx_dns_log_tags_log_id").on(table.logId),
    index("idx_dns_log_tags_tag_id").on(table.tagId),
  ]
);

export const webhooks = pgTable("webhooks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret"),
  isActive: boolean("is_active").default(true),
  triggers: jsonb("triggers").notNull(),
  cooldownMinutes: integer("cooldown_minutes").default(5),
  groupId: text("group_id").references(() => groups.id),
  lastTriggeredAt: text("last_triggered_at"),
  createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`now()`),
});

export const webhookTags = pgTable(
  "webhook_tags",
  {
    id: serial("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => alertTags.id),
    createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [
    uniqueIndex("idx_webhook_tags_unique").on(table.webhookId, table.tagId),
    index("idx_webhook_tags_webhook_id").on(table.webhookId),
    index("idx_webhook_tags_tag_id").on(table.tagId),
  ]
);

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id),
    snapshotDate: text("snapshot_date").notNull(),
    period: text("period").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).default(sql`now()`),
  },
  (table) => [
    index("idx_snapshot_unique").on(
      table.profileId,
      table.snapshotDate,
      table.period,
      table.type
    ),
  ]
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).default(sql`now()`),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
// Backward-compat aliases
export type Person = Group;
export type NewPerson = NewGroup;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type DnsLog = typeof dnsLogs.$inferSelect;
export type NewDnsLog = typeof dnsLogs.$inferInsert;
export type Tag = typeof alertTags.$inferSelect;
export type NewTag = typeof alertTags.$inferInsert;
export type AlertTag = Tag;
export type NewAlertTag = NewTag;
export type DomainList = typeof domainLists.$inferSelect;
export type NewDomainList = typeof domainLists.$inferInsert;
export type DomainListEntry = typeof domainListEntries.$inferSelect;
export type NewDomainListEntry = typeof domainListEntries.$inferInsert;
export type DnsLogTag = typeof dnsLogTags.$inferSelect;
export type NewDnsLogTag = typeof dnsLogTags.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookTag = typeof webhookTags.$inferSelect;
export type NewWebhookTag = typeof webhookTags.$inferInsert;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type Setting = typeof settings.$inferSelect;
