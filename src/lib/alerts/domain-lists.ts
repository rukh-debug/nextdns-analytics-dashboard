import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dnsLogTags,
  domainListEntries,
  domainLists,
  tags,
} from "@/lib/db/schema";
import { normalizeDomain, rebuildAllLogTags } from "@/lib/alerts/tagging";
import { createLogger } from "@/lib/logger";

const log = createLogger("domain-lists");

const BUILT_IN_ADWARE_MALWARE_TAG = {
  name: "adware + malware",
  color: "#f97316",
};

const BUILT_IN_ADWARE_MALWARE_LIST = {
  name: "StevenBlack Adware + Malware",
  sourceType: "builtin" as const,
  sourceUrl: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
};

let ensureBuiltInDomainListsPromise: Promise<{ tag: typeof tags.$inferSelect; list: typeof domainLists.$inferSelect }> | null = null;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function parseRawDomainList(text: string) {
  const domains = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutComment = line.split("#", 1)[0]?.trim() ?? "";
    if (!withoutComment) {
      continue;
    }

    const parts = withoutComment.split(/\s+/).filter(Boolean);
    const candidate = parts.length >= 2 ? parts[1] : parts[0];
    const normalized = normalizeDomain(candidate);
    if (normalized) {
      domains.add(normalized);
    }
  }

  return [...domains].sort((left, right) => left.localeCompare(right));
}

async function replaceDomainListEntries(listId: string, domains: string[]) {
  const db = getDb();
  await db.delete(domainListEntries).where(eq(domainListEntries.listId, listId));

  for (let index = 0; index < domains.length; index += 500) {
    const batch = domains.slice(index, index + 500).map((domain) => ({ listId, domain }));
    if (batch.length > 0) {
      await db.insert(domainListEntries).values(batch).onConflictDoNothing();
    }
  }

  await db.update(domainLists)
    .set({
      entryCount: domains.length,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(domainLists.id, listId));
}

export async function refreshDomainList(listId: string) {
  const db = getDb();
  const listRows = await db.select().from(domainLists).where(eq(domainLists.id, listId));
  const list = listRows[0] ?? null;

  if (!list) {
    throw new Error("Domain list not found");
  }

  if (!list.sourceUrl) {
    throw new Error("Domain list has no source URL");
  }

  let response: Response;
  try {
    response = await fetch(list.sourceUrl);
  } catch (error) {
    await db.update(domainLists)
      .set({
        lastFetchStatus: "error",
        lastFetchError: error instanceof Error ? error.message : "Failed to fetch list",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(domainLists.id, listId));
    throw error;
  }

  if (!response.ok) {
    const errorMessage = `Failed to fetch list: HTTP ${response.status}`;
    await db.update(domainLists)
      .set({
        lastFetchStatus: "error",
        lastFetchError: errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(domainLists.id, listId));
    throw new Error(errorMessage);
  }

  const text = await response.text();
  const domains = parseRawDomainList(text);
  await replaceDomainListEntries(listId, domains);

  await db.update(domainLists)
    .set({
      lastFetchedAt: new Date().toISOString(),
      lastFetchStatus: "success",
      lastFetchError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(domainLists.id, listId));

  await rebuildAllLogTags();

  return {
    listId,
    entryCount: domains.length,
  };
}

export async function createTag(input: { name: string; color?: string | null }) {
  const db = getDb();
  const slug = slugify(input.name);
  if (!slug) {
    throw new Error("Tag name is invalid");
  }

  const existingRows = await db.select().from(tags).where(eq(tags.slug, slug));
  const existing = existingRows[0] ?? null;
  if (existing) {
    throw new Error("A tag with that name already exists");
  }

  const rows = await db
    .insert(tags)
    .values({
      name: input.name.trim(),
      slug,
      color: input.color?.trim() || null,
    })
    .returning();
  return rows[0];
}

export async function updateTag(
  tagId: string,
  input: { name?: string; color?: string | null },
  options?: { rebuildLogs?: boolean }
) {
  const db = getDb();
  const protectedTag = await db
      .select({ isSystem: domainLists.isSystem })
    .from(domainLists)
    .where(eq(domainLists.tagId, tagId));
    if (protectedTag.some((row) => row.isSystem)) {
    throw new Error("Built-in tags cannot be edited");
  }

  const existingRows = await db.select().from(tags).where(eq(tags.id, tagId));
  const existing = existingRows[0] ?? null;
  if (!existing) {
    throw new Error("Tag not found");
  }

  const updates: Partial<typeof tags.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const slug = slugify(input.name);
    if (!slug) {
      throw new Error("Tag name is invalid");
    }
    const duplicateRows = await db
      .select()
      .from(tags)
      .where(eq(tags.slug, slug));
    const duplicate = duplicateRows[0] ?? null;
    if (duplicate && duplicate.id !== tagId) {
      throw new Error("A tag with that name already exists");
    }
    updates.name = input.name.trim();
    updates.slug = slug;
  }

  if (input.color !== undefined) {
    updates.color = input.color?.trim() || null;
  }

  await db.update(tags).set(updates).where(eq(tags.id, tagId));
  if (options?.rebuildLogs ?? true) {
    await rebuildAllLogTags();
  }

  const updatedRows = await db.select().from(tags).where(eq(tags.id, tagId));
  return updatedRows[0] ?? null;
}

export async function deleteTag(tagId: string) {
  const db = getDb();
  const protectedTag = await db
    .select({ id: domainLists.id, isSystem: domainLists.isSystem })
    .from(domainLists)
    .where(eq(domainLists.tagId, tagId));
  if (protectedTag.some((row) => row.isSystem)) {
    throw new Error("Built-in tags cannot be deleted");
  }

  const tagRows = await db.select().from(tags).where(eq(tags.id, tagId));
  const tag = tagRows[0] ?? null;
  if (!tag) {
    throw new Error("Tag not found");
  }

  const listsUsingTag = await db
    .select({ id: domainLists.id })
    .from(domainLists)
    .where(eq(domainLists.tagId, tagId));

  if (listsUsingTag.length > 0) {
    const listIds = listsUsingTag.map((list) => list.id);
    await db.delete(dnsLogTags).where(
      inArray(dnsLogTags.listId, listIds as [string, ...string[]])
    );
    await db.delete(domainListEntries).where(
      inArray(domainListEntries.listId, listIds as [string, ...string[]])
    );
    await db.delete(domainLists).where(
      inArray(domainLists.id, listIds as [string, ...string[]])
    );
  }

  await db.delete(dnsLogTags).where(eq(dnsLogTags.tagId, tagId));
  await db.delete(tags).where(eq(tags.id, tagId));
  await rebuildAllLogTags();
}

export async function createDomainList(input: {
  name: string;
  tagId: string;
  sourceUrl: string;
  sourceType?: "builtin" | "github_raw";
  isSystem?: boolean;
  refreshOnCreate?: boolean;
}) {
  const db = getDb();
  const tagRows = await db.select().from(tags).where(eq(tags.id, input.tagId));
  const tag = tagRows[0] ?? null;
  if (!tag) {
    throw new Error("Tag not found");
  }

  const listRows = await db
    .insert(domainLists)
    .values({
      name: input.name.trim(),
      tagId: input.tagId,
      sourceType: input.sourceType ?? "github_raw",
      sourceUrl: input.sourceUrl.trim(),
      isSystem: input.isSystem ?? false,
      isActive: true,
    })
    .returning();
  const list = listRows[0];

  if (input.refreshOnCreate ?? true) {
    await refreshDomainList(list.id);
    const updatedRows = await db.select().from(domainLists).where(eq(domainLists.id, list.id));
    return updatedRows[0] ?? null;
  }

  return list;
}

export async function updateDomainList(
  listId: string,
  input: {
    name?: string;
    tagId?: string;
    sourceUrl?: string;
    isActive?: boolean;
  },
  options?: {
    rebuildLogs?: boolean;
    refreshSource?: boolean;
  }
) {
  const db = getDb();
  const existingRows = await db.select().from(domainLists).where(eq(domainLists.id, listId));
  const existing = existingRows[0] ?? null;
  if (!existing) {
    throw new Error("Domain list not found");
  }

  if (existing.isSystem) {
    throw new Error("Built-in domain lists cannot be edited");
  }

  const nextSourceUrl = input.sourceUrl?.trim() ?? existing.sourceUrl;
  const updates: Partial<typeof domainLists.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    updates.name = input.name.trim();
  }

  if (input.tagId !== undefined) {
    const tagRows = await db.select().from(tags).where(eq(tags.id, input.tagId));
    const tag = tagRows[0] ?? null;
    if (!tag) {
      throw new Error("Tag not found");
    }
    updates.tagId = input.tagId;
  }

  if (input.sourceUrl !== undefined) {
    updates.sourceUrl = nextSourceUrl;
  }

  if (input.isActive !== undefined) {
    updates.isActive = input.isActive;
  }

  await db.update(domainLists).set(updates).where(eq(domainLists.id, listId));

  const shouldRefresh = input.sourceUrl !== undefined && (options?.refreshSource ?? true);
  if (shouldRefresh) {
    await refreshDomainList(listId);
  } else if (options?.rebuildLogs ?? true) {
    await rebuildAllLogTags();
  }

  const updatedRows = await db.select().from(domainLists).where(eq(domainLists.id, listId));
  return updatedRows[0] ?? null;
}

export async function deleteDomainList(listId: string) {
  const db = getDb();
  const existingRows = await db.select().from(domainLists).where(eq(domainLists.id, listId));
  const existing = existingRows[0] ?? null;
  if (!existing) {
    throw new Error("Domain list not found");
  }

  if (existing.isSystem) {
    throw new Error("Built-in domain lists cannot be deleted");
  }

  await db.delete(dnsLogTags).where(eq(dnsLogTags.listId, listId));
  await db.delete(domainListEntries).where(eq(domainListEntries.listId, listId));
  await db.delete(domainLists).where(eq(domainLists.id, listId));
  await rebuildAllLogTags();
}

export async function ensureBuiltInDomainLists() {
  if (ensureBuiltInDomainListsPromise) {
    return ensureBuiltInDomainListsPromise;
  }

  ensureBuiltInDomainListsPromise = ensureBuiltInDomainListsInternal();

  try {
    return await ensureBuiltInDomainListsPromise;
  } finally {
    ensureBuiltInDomainListsPromise = null;
  }
}

async function ensureBuiltInDomainListsInternal() {
  const db = getDb();

  let builtInTag = (
    await db.select().from(tags).where(eq(tags.slug, slugify(BUILT_IN_ADWARE_MALWARE_TAG.name)))
  )[0] ?? null;

  if (!builtInTag) {
    try {
      builtInTag = await createTag(BUILT_IN_ADWARE_MALWARE_TAG);
    } catch {
      builtInTag = (
        await db.select().from(tags).where(eq(tags.slug, slugify(BUILT_IN_ADWARE_MALWARE_TAG.name)))
      )[0] ?? null;
    }
  }

  if (!builtInTag) {
    throw new Error("Failed to ensure built-in tag");
  }

  const existingBuiltInLists = await db
    .select()
    .from(domainLists)
    .where(eq(domainLists.sourceUrl, BUILT_IN_ADWARE_MALWARE_LIST.sourceUrl));

  const preferredBuiltInList =
    existingBuiltInLists.find((list) => list.lastFetchStatus === "success") ?? existingBuiltInLists[0] ?? null;

  const duplicateBuiltInListIds = existingBuiltInLists
    .filter((list) => preferredBuiltInList && list.id !== preferredBuiltInList.id)
    .map((list) => list.id);

  if (duplicateBuiltInListIds.length > 0) {
    await db.delete(dnsLogTags).where(inArray(dnsLogTags.listId, duplicateBuiltInListIds as [string, ...string[]]));
    await db.delete(domainListEntries).where(
      inArray(domainListEntries.listId, duplicateBuiltInListIds as [string, ...string[]])
    );
    await db.delete(domainLists).where(inArray(domainLists.id, duplicateBuiltInListIds as [string, ...string[]]));
  }

  let builtInList = preferredBuiltInList ?? (
    await db
      .select()
      .from(domainLists)
      .where(eq(domainLists.sourceUrl, BUILT_IN_ADWARE_MALWARE_LIST.sourceUrl))
  )[0] ?? null;

  if (!builtInList) {
    builtInList = await createDomainList({
      name: BUILT_IN_ADWARE_MALWARE_LIST.name,
      tagId: builtInTag.id,
      sourceUrl: BUILT_IN_ADWARE_MALWARE_LIST.sourceUrl,
      sourceType: BUILT_IN_ADWARE_MALWARE_LIST.sourceType,
      isSystem: true,
      refreshOnCreate: false,
    });

    try {
      await refreshDomainList(builtInList.id);
      builtInList = (
        await db.select().from(domainLists).where(eq(domainLists.id, builtInList.id))
      )[0] ?? builtInList;
    } catch (error) {
      log.error({ err: error }, "Failed to refresh built-in list");
    }
  } else {
    const updates: Partial<typeof domainLists.$inferInsert> = {};
    if (builtInList.tagId !== builtInTag.id) {
      updates.tagId = builtInTag.id;
    }
    if (builtInList.sourceType !== BUILT_IN_ADWARE_MALWARE_LIST.sourceType) {
      updates.sourceType = BUILT_IN_ADWARE_MALWARE_LIST.sourceType;
    }
    if (!builtInList.isSystem) {
      updates.isSystem = true;
    }
    if (!builtInList.isActive) {
      updates.isActive = true;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await db.update(domainLists).set(updates).where(eq(domainLists.id, builtInList.id));
      builtInList = (
        await db.select().from(domainLists).where(eq(domainLists.id, builtInList.id))
      )[0] ?? builtInList;
    }

    if (!builtInList.lastFetchedAt || !builtInList.entryCount) {
      try {
        await refreshDomainList(builtInList.id);
        builtInList = (
          await db.select().from(domainLists).where(eq(domainLists.id, builtInList.id))
        )[0] ?? builtInList;
      } catch (error) {
        log.error({ err: error }, "Failed to refresh built-in list");
      }
    }
  }

  return { tag: builtInTag, list: builtInList };
}

export const createAlertTag = createTag;
export const updateAlertTag = updateTag;
export const deleteAlertTag = deleteTag;
