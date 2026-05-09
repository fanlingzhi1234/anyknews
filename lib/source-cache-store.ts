import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BoardItem, BoardSource } from "@/lib/board-service";

export type CompactSourceCacheItem = Pick<
  BoardItem,
  "id" | "title" | "summary" | "metric" | "url" | "originalUrl" | "publishedAt" | "sourceId" | "sourceName"
>;

export type CompactSourceMetadata = Omit<BoardSource, "items">;

export type CompactSourceCacheEntry = {
  backoffUntil?: string;
  cachedAt?: string;
  error?: string;
  expiresAt?: string;
  items: CompactSourceCacheItem[];
  lastSuccessAt?: string;
  source: CompactSourceMetadata;
  sourceId: string;
};

type DiskPayload = {
  entries: CompactSourceCacheEntry[];
  version: 1;
};

declare global {
  var __anyknewsCompactSourceCache: Map<string, CompactSourceCacheEntry> | undefined;
}

const cache = globalThis.__anyknewsCompactSourceCache ?? new Map<string, CompactSourceCacheEntry>();
globalThis.__anyknewsCompactSourceCache = cache;

export async function loadSourceCacheFromDisk(): Promise<Map<string, CompactSourceCacheEntry>> {
  if (isDiskCacheDisabled()) {
    return cache;
  }

  try {
    const payload = JSON.parse(await readFile(getDiskCachePath(), "utf8")) as unknown;
    const entries = parseDiskPayload(payload);

    cache.clear();
    for (const entry of entries) {
      cache.set(entry.sourceId, entry);
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      console.warn("Failed to load compact source cache:", error);
    }
  }

  return cache;
}

export function getCompactSourceCache(sourceId: string) {
  return cache.get(sourceId);
}

export function setCompactSourceCache(entry: CompactSourceCacheEntry) {
  const compactEntry = compactSourceCacheEntry(entry);
  cache.set(compactEntry.sourceId, compactEntry);
}

export function listCompactSourceCache() {
  return Array.from(cache.values());
}

export async function persistSourceCacheToDisk(): Promise<void> {
  if (isDiskCacheDisabled()) {
    return;
  }

  const diskCachePath = getDiskCachePath();
  const payload: DiskPayload = {
    version: 1,
    entries: listCompactSourceCache().map(compactSourceCacheEntry)
  };

  await mkdir(path.dirname(diskCachePath), { recursive: true });
  await writeFile(diskCachePath, JSON.stringify(payload), "utf8");
}

export function getBackoffUntil(sourceId: string) {
  return cache.get(sourceId)?.backoffUntil;
}

export function clearSourceCacheForTests() {
  cache.clear();
}

function getDiskCachePath() {
  return process.env.ANYKNEWS_DISK_CACHE_PATH
    ? path.resolve(process.env.ANYKNEWS_DISK_CACHE_PATH)
    : path.join(process.cwd(), ".cache", "anyknews", "source-cache.json");
}

function isDiskCacheDisabled() {
  return process.env.ANYKNEWS_DISABLE_DISK_CACHE === "true";
}

function parseDiskPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return [];
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  return entries
    .map(parseCacheEntry)
    .filter((entry): entry is CompactSourceCacheEntry => Boolean(entry));
}

function parseCacheEntry(entry: unknown): CompactSourceCacheEntry | undefined {
  if (!isRecord(entry) || typeof entry.sourceId !== "string" || !isRecord(entry.source)) {
    return undefined;
  }

  const source = compactSourceMetadata(entry.source);
  if (!source || source.id !== entry.sourceId) {
    return undefined;
  }

  return compactSourceCacheEntry({
    backoffUntil: optionalString(entry.backoffUntil),
    cachedAt: optionalString(entry.cachedAt),
    error: optionalString(entry.error),
    expiresAt: optionalString(entry.expiresAt),
    items: Array.isArray(entry.items) ? entry.items.map(parseSourceItem).filter(isCompactSourceItem) : [],
    lastSuccessAt: optionalString(entry.lastSuccessAt),
    source,
    sourceId: entry.sourceId
  });
}

function compactSourceCacheEntry(entry: CompactSourceCacheEntry): CompactSourceCacheEntry {
  const source = compactSourceMetadata(entry.source);

  if (!source || source.id !== entry.sourceId) {
    throw new Error(`Invalid compact source cache entry for ${entry.sourceId}`);
  }

  return {
    sourceId: entry.sourceId,
    source,
    items: entry.items.map(compactSourceItem),
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
    lastSuccessAt: entry.lastSuccessAt,
    backoffUntil: entry.backoffUntil,
    error: entry.error
  };
}

function compactSourceMetadata(source: unknown): CompactSourceMetadata | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const diagnostic = isRecord(source.diagnostic)
    ? {
        cacheExpiresAt: optionalString(source.diagnostic.cacheExpiresAt),
        errorMessage: optionalString(source.diagnostic.errorMessage),
        itemCount: typeof source.diagnostic.itemCount === "number" ? source.diagnostic.itemCount : 0,
        mode: isDiagnosticMode(source.diagnostic.mode) ? source.diagnostic.mode : "seed",
        updatedAt: typeof source.diagnostic.updatedAt === "string" ? source.diagnostic.updatedAt : ""
      }
    : undefined;

  if (
    typeof source.id !== "string" ||
    typeof source.category !== "string" ||
    typeof source.categoryKey !== "string" ||
    !diagnostic ||
    typeof source.logo !== "string" ||
    typeof source.tone !== "string" ||
    typeof source.name !== "string" ||
    typeof source.board !== "string" ||
    typeof source.color !== "string" ||
    typeof source.displayType !== "string" ||
    typeof source.footer !== "string" ||
    typeof source.homeUrl !== "string" ||
    typeof source.priority !== "number" ||
    typeof source.status !== "string" ||
    typeof source.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: source.id,
    category: source.category as CompactSourceMetadata["category"],
    categoryKey: source.categoryKey as CompactSourceMetadata["categoryKey"],
    diagnostic,
    logo: source.logo,
    tone: source.tone as CompactSourceMetadata["tone"],
    name: source.name,
    board: source.board,
    color: source.color as CompactSourceMetadata["color"],
    defaultSubscribed: typeof source.defaultSubscribed === "boolean" ? source.defaultSubscribed : undefined,
    displayType: source.displayType as CompactSourceMetadata["displayType"],
    footer: source.footer,
    homeUrl: source.homeUrl,
    priority: source.priority,
    status: source.status as CompactSourceMetadata["status"],
    updatedAt: source.updatedAt
  };
}

function compactSourceItem(item: unknown): CompactSourceCacheItem {
  if (!isRecord(item)) {
    throw new Error("Invalid compact source cache item");
  }

  const sourceId = stringOrEmpty(item.sourceId);
  const sourceName = stringOrEmpty(item.sourceName);
  const title = stringOrEmpty(item.title);
  const url = stringOrEmpty(item.url);

  if (!sourceId || !sourceName || !title || !url) {
    throw new Error("Compact source cache item is missing required fields");
  }

  return {
    id: stringOrEmpty(item.id),
    title,
    summary: stringOrEmpty(item.summary),
    metric: stringOrEmpty(item.metric),
    url,
    originalUrl: stringOrEmpty(item.originalUrl) || url,
    publishedAt: optionalString(item.publishedAt),
    sourceId,
    sourceName
  };
}

function parseSourceItem(item: unknown) {
  try {
    return compactSourceItem(item);
  } catch {
    return undefined;
  }
}

function isCompactSourceItem(item: CompactSourceCacheItem | undefined): item is CompactSourceCacheItem {
  return Boolean(item);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiagnosticMode(value: unknown): value is BoardSource["diagnostic"]["mode"] {
  return value === "live" || value === "fallback" || value === "seed";
}

function isMissingFileError(error: unknown) {
  return isRecord(error) && error.code === "ENOENT";
}
