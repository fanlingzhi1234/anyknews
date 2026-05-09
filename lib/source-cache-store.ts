import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BoardItem, BoardSource } from "@/lib/board-service";

export type CompactSourceCacheItem = Pick<
  BoardItem,
  "id" | "title" | "summary" | "metric" | "url" | "originalUrl" | "publishedAt" | "sourceId" | "sourceName"
>;

export type CompactSourceCacheEntry = {
  sourceId: string;
  expiresAt: number;
  updatedAt: number;
  lastSuccessAt?: number;
  backoffUntil?: number;
  error?: string;
  source: BoardSource;
};

type DiskPayload = {
  version: 1;
  entries: CompactSourceCacheEntry[];
};

declare global {
  var __anyknewsCompactSourceCache: Map<string, CompactSourceCacheEntry> | undefined;
}

const cache = globalThis.__anyknewsCompactSourceCache ?? new Map<string, CompactSourceCacheEntry>();
globalThis.__anyknewsCompactSourceCache = cache;

let persistQueue = Promise.resolve();

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

export function getCompactBoardSource(sourceId: string): BoardSource | undefined {
  const entry = getCompactSourceCache(sourceId);
  return entry ? toCompactBoardSource(entry) : undefined;
}

export function setCompactSourceCache(entry: CompactSourceCacheEntry) {
  const compactEntry = compactSourceCacheEntry(entry);
  cache.set(compactEntry.sourceId, compactEntry);
}

export function listCompactSourceCache() {
  return Array.from(cache.values()).map(compactSourceCacheEntry);
}

export async function persistSourceCacheToDisk(): Promise<void> {
  persistQueue = persistQueue.then(writeSourceCacheToDisk, writeSourceCacheToDisk);
  return persistQueue;
}

export function getBackoffUntil(sourceId: string): number | undefined {
  return cache.get(sourceId)?.backoffUntil;
}

export function toCompactBoardSource(entry: CompactSourceCacheEntry): BoardSource {
  return sanitizeBoardSource(entry.source);
}

export function clearSourceCacheForTests() {
  cache.clear();
}

async function writeSourceCacheToDisk() {
  if (isDiskCacheDisabled()) {
    return;
  }

  const diskCachePath = getDiskCachePath();
  const cacheDir = path.dirname(diskCachePath);
  const tempPath = path.join(
    cacheDir,
    `.${path.basename(diskCachePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const payload: DiskPayload = {
    version: 1,
    entries: listCompactSourceCache()
  };

  await mkdir(cacheDir, { recursive: true });
  await writeFile(tempPath, JSON.stringify(payload), "utf8");
  await rename(tempPath, diskCachePath);
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
  if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.entries)) {
    return [];
  }

  return payload.entries
    .map(parseCacheEntry)
    .filter((entry): entry is CompactSourceCacheEntry => Boolean(entry));
}

function parseCacheEntry(entry: unknown): CompactSourceCacheEntry | undefined {
  if (!isRecord(entry)) {
    return undefined;
  }

  const sourceId = requiredString(entry.sourceId);
  const source = parseBoardSource(entry.source);
  const expiresAt = requiredNumber(entry.expiresAt);
  const updatedAt = requiredNumber(entry.updatedAt);

  if (!sourceId || !source || source.id !== sourceId || expiresAt === undefined || updatedAt === undefined) {
    return undefined;
  }

  const parsedEntry: CompactSourceCacheEntry = {
    sourceId,
    expiresAt,
    updatedAt,
    source,
    lastSuccessAt: optionalNumber(entry.lastSuccessAt),
    backoffUntil: optionalNumber(entry.backoffUntil),
    error: optionalString(entry.error)
  };

  return compactSourceCacheEntry(parsedEntry);
}

function compactSourceCacheEntry(entry: CompactSourceCacheEntry): CompactSourceCacheEntry {
  const sourceId = requiredString(entry.sourceId);
  const expiresAt = requiredNumber(entry.expiresAt);
  const updatedAt = requiredNumber(entry.updatedAt);
  const source = sanitizeBoardSource(entry.source);

  if (!sourceId || source.id !== sourceId || expiresAt === undefined || updatedAt === undefined) {
    throw new Error(`Invalid compact source cache entry for ${entry.sourceId}`);
  }

  return {
    sourceId,
    expiresAt,
    updatedAt,
    lastSuccessAt: optionalNumber(entry.lastSuccessAt),
    backoffUntil: optionalNumber(entry.backoffUntil),
    error: optionalString(entry.error),
    source
  };
}

function parseBoardSource(source: unknown): BoardSource | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  try {
    return sanitizeBoardSource(source);
  } catch {
    return undefined;
  }
}

function sanitizeBoardSource(source: unknown): BoardSource {
  if (!isRecord(source)) {
    throw new Error("Invalid compact source cache source");
  }

  const id = requiredString(source.id);
  const category = parseAllowed(source.category, categories);
  const categoryKey = parseAllowed(source.categoryKey, categoryKeys);
  const diagnostic = parseDiagnostic(source.diagnostic);
  const logo = requiredString(source.logo);
  const tone = parseAllowed(source.tone, tones);
  const name = requiredString(source.name);
  const board = requiredString(source.board);
  const color = parseAllowed(source.color, colors);
  const defaultSubscribed = typeof source.defaultSubscribed === "boolean" ? source.defaultSubscribed : undefined;
  const displayType = parseAllowed(source.displayType, displayTypes);
  const footer = requiredString(source.footer);
  const homeUrl = requiredString(source.homeUrl);
  const priority = requiredNumber(source.priority);
  const status = parseAllowed(source.status, sourceStatuses);
  const updatedAt = requiredString(source.updatedAt);

  if (
    !id ||
    !category ||
    !categoryKey ||
    !diagnostic ||
    !logo ||
    !tone ||
    !name ||
    !board ||
    !color ||
    !displayType ||
    !footer ||
    !homeUrl ||
    priority === undefined ||
    !status ||
    !updatedAt ||
    !Array.isArray(source.items)
  ) {
    throw new Error(`Invalid compact source cache source for ${id || "(unknown)"}`);
  }

  return {
    id,
    category,
    categoryKey,
    diagnostic,
    logo,
    tone,
    name,
    board,
    color,
    defaultSubscribed,
    displayType,
    footer,
    homeUrl,
    priority,
    status,
    updatedAt,
    items: source.items.map(sanitizeBoardItem)
  };
}

function parseDiagnostic(diagnostic: unknown): BoardSource["diagnostic"] | undefined {
  if (!isRecord(diagnostic)) {
    return undefined;
  }

  const mode = parseAllowed(diagnostic.mode, diagnosticModes);
  const itemCount = requiredNumber(diagnostic.itemCount);
  const updatedAt = requiredString(diagnostic.updatedAt);

  if (!mode || itemCount === undefined || !updatedAt) {
    return undefined;
  }

  return {
    cacheExpiresAt: optionalString(diagnostic.cacheExpiresAt),
    errorMessage: optionalString(diagnostic.errorMessage),
    itemCount,
    mode,
    updatedAt
  };
}

function sanitizeBoardItem(item: unknown): CompactSourceCacheItem {
  if (!isRecord(item)) {
    throw new Error("Invalid compact source cache item");
  }

  const id = requiredString(item.id);
  const title = requiredString(item.title);
  const summary = stringOrEmpty(item.summary);
  const metric = stringOrEmpty(item.metric);
  const url = requiredString(item.url);
  const originalUrl = requiredString(item.originalUrl);
  const sourceId = requiredString(item.sourceId);
  const sourceName = requiredString(item.sourceName);

  if (!id || !title || !url || !originalUrl || !sourceId || !sourceName) {
    throw new Error("Compact source cache item is missing required fields");
  }

  return {
    id,
    title,
    summary,
    metric,
    url,
    originalUrl,
    publishedAt: optionalString(item.publishedAt),
    sourceId,
    sourceName
  };
}

function parseAllowed<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined {
  return typeof value === "string" && allowed.includes(value) ? value : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown) {
  return isRecord(error) && error.code === "ENOENT";
}

const categories = ["AI资讯", "技术", "广义资讯", "科技资讯", "娱乐", "金融", "汽车"] as const;
const categoryKeys = ["ai", "tech", "general", "biz", "ent", "finance", "auto"] as const;
const colors = ["blue", "cyan", "violet", "emerald", "amber", "rose", "slate", "red", "green", "teal"] as const;
const diagnosticModes = ["live", "fallback", "seed"] as const;
const displayTypes = ["ranked", "bullets", "rank", "timeline", "article"] as const;
const sourceStatuses = ["ok", "refreshing", "error"] as const;
const tones = ["ai", "tech", "news", "biz", "ent", "fin", "car"] as const;
