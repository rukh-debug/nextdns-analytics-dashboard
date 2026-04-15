import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  alertTags,
  dnsLogs,
  dnsLogTags,
  domainListEntries,
  domainLists,
} from "@/lib/db/schema";

const TAG_INSERT_BATCH_SIZE = 500;
const LOG_UPDATE_BATCH_SIZE = 250;

type ActiveDomainEntry = {
  domain: string;
  tagId: string;
  tagName: string;
  tagSlug: string;
  listId: string;
  listName: string;
};

export type LogTagMatch = {
  tagId: string;
  tagName: string;
  tagSlug: string;
  listId: string;
  listName: string;
  matchedDomain: string;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function normalizeDomain(input: string | null | undefined) {
  const value = input?.trim().toLowerCase().replace(/^\.+|\.+$/g, "") ?? "";
  if (!value || !value.includes(".") || value.includes(" ")) {
    return null;
  }
  return value;
}

export function buildDomainCandidates(domain: string | null | undefined) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return [];
  }

  const labels = normalized.split(".");
  const candidates: string[] = [];
  for (let index = 0; index < labels.length - 1; index += 1) {
    candidates.push(labels.slice(index).join("."));
  }
  return candidates;
}

function buildLookup(entries: ActiveDomainEntry[]) {
  const lookup = new Map<string, ActiveDomainEntry[]>();
  for (const entry of entries) {
    const existing = lookup.get(entry.domain) ?? [];
    existing.push(entry);
    lookup.set(entry.domain, existing);
  }
  return lookup;
}

async function loadActiveEntryLookup() {
  const db = getDb();
  const rows = await db
    .select({
      domain: domainListEntries.domain,
      tagId: alertTags.id,
      tagName: alertTags.name,
      tagSlug: alertTags.slug,
      listId: domainLists.id,
      listName: domainLists.name,
    })
    .from(domainListEntries)
    .innerJoin(domainLists, eq(domainListEntries.listId, domainLists.id))
    .innerJoin(alertTags, eq(domainLists.tagId, alertTags.id))
    .where(eq(domainLists.isActive, true));

  return buildLookup(rows);
}

export function summarizeTagMatches(matches: LogTagMatch[]) {
  const uniqueNames = [...new Set(matches.map((match) => match.tagName))].sort((left, right) =>
    left.localeCompare(right)
  );

  if (uniqueNames.length === 0) {
    return null;
  }

  if (uniqueNames.length === 1) {
    return uniqueNames[0];
  }

  return `${uniqueNames[0]} +${uniqueNames.length - 1}`;
}

function matchDomain(domain: string | null | undefined, lookup: Map<string, ActiveDomainEntry[]>) {
  const matches = new Map<string, LogTagMatch>();

  for (const candidate of buildDomainCandidates(domain)) {
    const entries = lookup.get(candidate) ?? [];
    for (const entry of entries) {
      const key = `${entry.tagId}:${entry.listId}:${candidate}`;
      matches.set(key, {
        tagId: entry.tagId,
        tagName: entry.tagName,
        tagSlug: entry.tagSlug,
        listId: entry.listId,
        listName: entry.listName,
        matchedDomain: candidate,
      });
    }
  }

  return [...matches.values()].sort((left, right) => {
    if (left.tagName === right.tagName) {
      if (left.listName === right.listName) {
        return left.matchedDomain.localeCompare(right.matchedDomain);
      }
      return left.listName.localeCompare(right.listName);
    }
    return left.tagName.localeCompare(right.tagName);
  });
}

export async function resolveTagMatchesForDomains(domains: Array<string | null | undefined>) {
  const lookup = await loadActiveEntryLookup();
  return domains.map((domain) => matchDomain(domain, lookup));
}

export async function getTagsForLogIds(logIds: number[]) {
  if (logIds.length === 0) {
    return new Map<number, LogTagMatch[]>();
  }

  const db = getDb();
  const rows = await db
    .select({
      logId: dnsLogTags.logId,
      tagId: alertTags.id,
      tagName: alertTags.name,
      tagSlug: alertTags.slug,
      listId: domainLists.id,
      listName: domainLists.name,
      matchedDomain: dnsLogTags.matchedDomain,
    })
    .from(dnsLogTags)
    .innerJoin(alertTags, eq(dnsLogTags.tagId, alertTags.id))
    .innerJoin(domainLists, eq(dnsLogTags.listId, domainLists.id))
    .where(inArray(dnsLogTags.logId, logIds as [number, ...number[]]));

  const map = new Map<number, LogTagMatch[]>();
  for (const row of rows) {
    const existing = map.get(row.logId) ?? [];
    existing.push({
      tagId: row.tagId,
      tagName: row.tagName,
      tagSlug: row.tagSlug,
      listId: row.listId,
      listName: row.listName,
      matchedDomain: row.matchedDomain,
    });
    map.set(row.logId, existing);
  }

  return map;
}

export async function rebuildAllLogTags() {
  const db = getDb();
  const lookup = await loadActiveEntryLookup();
  const logs = await db
    .select({ id: dnsLogs.id, domain: dnsLogs.domain })
    .from(dnsLogs);

  await db.delete(dnsLogTags);
  await db.update(dnsLogs).set({ isFlagged: false, flagReason: null });

  const logTagRows: Array<typeof dnsLogTags.$inferInsert> = [];
  const summaries = new Map<number, string>();

  for (const log of logs) {
    const matches = matchDomain(log.domain, lookup);
    if (matches.length === 0) {
      continue;
    }

    summaries.set(log.id, summarizeTagMatches(matches) ?? "flagged");
    for (const match of matches) {
      logTagRows.push({
        logId: log.id,
        tagId: match.tagId,
        listId: match.listId,
        matchedDomain: match.matchedDomain,
      });
    }
  }

  for (const batch of chunk(logTagRows, TAG_INSERT_BATCH_SIZE)) {
    await db.insert(dnsLogTags).values(batch).onConflictDoNothing();
  }

  for (const batch of chunk([...summaries.entries()], LOG_UPDATE_BATCH_SIZE)) {
    for (const [logId, flagReason] of batch) {
      await db.update(dnsLogs)
        .set({ isFlagged: true, flagReason })
        .where(eq(dnsLogs.id, logId));
    }
  }

  return {
    totalLogs: logs.length,
    flaggedLogs: summaries.size,
    tagRows: logTagRows.length,
  };
}

export async function attachTagsToInsertedLogs(
  insertedLogs: Array<{ id: number; eventHash: string }>,
  matchesByEventHash: Map<string, LogTagMatch[]>
) {
  if (insertedLogs.length === 0 || matchesByEventHash.size === 0) {
    return;
  }

  const db = getDb();
  const rows: Array<typeof dnsLogTags.$inferInsert> = [];

  for (const log of insertedLogs) {
    const matches = matchesByEventHash.get(log.eventHash) ?? [];
    for (const match of matches) {
      rows.push({
        logId: log.id,
        tagId: match.tagId,
        listId: match.listId,
        matchedDomain: match.matchedDomain,
      });
    }
  }

  for (const batch of chunk(rows, TAG_INSERT_BATCH_SIZE)) {
    await db.insert(dnsLogTags).values(batch).onConflictDoNothing();
  }
}

export async function retagLogsMatchingDomains(domains: string[]) {
  const normalizedDomains = [...new Set(domains.map((domain) => normalizeDomain(domain)).filter(Boolean))] as string[];

  if (normalizedDomains.length === 0) {
    return { retagged: 0 };
  }

  const db = getDb();
  const logs = await db.select({ id: dnsLogs.id, domain: dnsLogs.domain }).from(dnsLogs);
  const impacted = logs.filter((log) => {
    const candidates = buildDomainCandidates(log.domain);
    return candidates.some((candidate) => normalizedDomains.includes(candidate));
  });

  if (impacted.length === 0) {
    return { retagged: 0 };
  }

  const impactedIds = impacted.map((log) => log.id);
  for (const batch of chunk(impactedIds, LOG_UPDATE_BATCH_SIZE)) {
    await db.delete(dnsLogTags).where(inArray(dnsLogTags.logId, batch as [number, ...number[]]));
    for (const logId of batch) {
      await db.update(dnsLogs).set({ isFlagged: false, flagReason: null }).where(eq(dnsLogs.id, logId));
    }
  }

  const lookup = await loadActiveEntryLookup();
  const logTagRows: Array<typeof dnsLogTags.$inferInsert> = [];

  for (const log of impacted) {
    const matches = matchDomain(log.domain, lookup);
    if (matches.length === 0) {
      continue;
    }

    for (const match of matches) {
      logTagRows.push({
        logId: log.id,
        tagId: match.tagId,
        listId: match.listId,
        matchedDomain: match.matchedDomain,
      });
    }

    await db.update(dnsLogs)
      .set({ isFlagged: true, flagReason: summarizeTagMatches(matches) ?? "flagged" })
      .where(eq(dnsLogs.id, log.id));
  }

  for (const batch of chunk(logTagRows, TAG_INSERT_BATCH_SIZE)) {
    await db.insert(dnsLogTags).values(batch).onConflictDoNothing();
  }

  return { retagged: impacted.length };
}

export async function getTaggedWebhookPayload(logId: number) {
  const db = getDb();
  const logRows = await db
    .select({
      id: dnsLogs.id,
      profileId: dnsLogs.profileId,
      deviceId: dnsLogs.deviceId,
      domain: dnsLogs.domain,
      rootDomain: dnsLogs.rootDomain,
      timestamp: dnsLogs.timestamp,
      flagReason: dnsLogs.flagReason,
    })
    .from(dnsLogs)
    .where(eq(dnsLogs.id, logId));
  const log = logRows[0] ?? null;

  if (!log) {
    return null;
  }

  const tags = (await getTagsForLogIds([logId])).get(logId) ?? [];
  return {
    ...log,
    tags,
  };
}
