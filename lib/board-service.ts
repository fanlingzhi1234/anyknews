import { createHash } from "node:crypto";
import {
  categories,
  catalogSources,
  sourceHomeUrls,
  sources,
  type NewsCategory,
  type NewsItem,
  type SourceColor,
  type SourceDisplayType
} from "@/lib/news-data";
import { getConnector } from "@/lib/connectors";
import type { FetchedItem } from "@/lib/connectors/types";
import {
  getCompactBoardSource,
  getCompactSourceCache,
  listCompactSourceCache,
  loadSourceCacheFromDisk,
  persistSourceCacheToDisk,
  setCompactSourceCache
} from "@/lib/source-cache-store";
import { decideSourceRefresh, type RefreshDecisionReason, type RefreshIntent } from "@/lib/source-refresh-planner";
import { sourceCatalogById } from "@/lib/sources/catalog";

export type CategoryKey = (typeof categories)[number]["anchor"];

export type BoardItem = NewsItem & {
  id: string;
  originalUrl: string;
  publishedAt?: string;
  sourceId: string;
  sourceName: string;
};

export type BoardSource = {
  id: string;
  category: NewsCategory;
  categoryKey: CategoryKey;
  diagnostic: {
    cacheExpiresAt?: string;
    errorMessage?: string;
    itemCount: number;
    mode: "live" | "fallback" | "seed";
    updatedAt: string;
  };
  logo: string;
  tone: "ai" | "tech" | "news" | "biz" | "ent" | "fin" | "car";
  name: string;
  board: string;
  color: SourceColor;
  defaultSubscribed?: boolean;
  displayType: SourceDisplayType;
  footer: string;
  homeUrl: string;
  priority: number;
  status: "ok" | "refreshing" | "error";
  updatedAt: string;
  items: BoardItem[];
};

export type BoardPayload = {
  generatedAt: string;
  sourceCount: number;
  itemCount: number;
  sources: BoardSource[];
};

export type RefreshMode = "none" | "stale" | "force";

export type BoardDataOptions = {
  refresh?: RefreshMode;
  sourceIds?: string[];
  itemLimit?: number;
  includeCatalog?: boolean;
};

export type RefreshResult = {
  error?: string;
  fetchRunId?: string;
  itemsFound: number;
  itemsSaved: number;
  reason?: RefreshDecisionReason;
  sourceId: string;
  status: "success" | "skipped" | "error";
};

export type SourceItemsPage = {
  sourceId: string;
  page: number;
  pageSize: number;
  totalItems: number;
  items: BoardItem[];
};

type SourceCacheEntry = {
  error?: string;
  expiresAt: number;
  mode: "live" | "fallback";
  source: BoardSource;
  updatedAt: number;
};

declare global {
  var __anyknewsSourceCache: Map<string, SourceCacheEntry> | undefined;
}

const categoryKeyByLabel = new Map(
  categories.map((category) => [category.label, category.anchor] as const)
);
const sourceConfigById = new Map(catalogSources.map((source) => [source.id, source]));
const sourceCache = globalThis.__anyknewsSourceCache ?? new Map<string, SourceCacheEntry>();
globalThis.__anyknewsSourceCache = sourceCache;

const defaultCacheTtlMs = getEnvSeconds("ANYKNEWS_CACHE_TTL_SECONDS", 10 * 60) * 1000;
const errorCacheTtlMs = getEnvSeconds("ANYKNEWS_ERROR_CACHE_TTL_SECONDS", 2 * 60) * 1000;
const sourceItemLimit = getPositiveIntegerEnv("ANYKNEWS_SOURCE_ITEM_LIMIT", 50);
const boardItemLimit = getPositiveIntegerEnv("ANYKNEWS_BOARD_ITEM_LIMIT", 8);
const sourcePageItemLimit = getPositiveIntegerEnv("ANYKNEWS_SOURCE_PAGE_ITEM_LIMIT", 8);
const maxBoardSources = getPositiveIntegerEnv("ANYKNEWS_MAX_BOARD_SOURCES", 80);
const failureBackoffMs = getEnvSeconds("ANYKNEWS_FAILURE_BACKOFF_SECONDS", 300) * 1000;
const sourceCacheTtlMs: Record<string, number> = {
  general: getEnvSeconds("ANYKNEWS_ZHIHU_CACHE_TTL_SECONDS", 2 * 60) * 1000,
  tech: getEnvSeconds("ANYKNEWS_GITHUB_CACHE_TTL_SECONDS", 60 * 60) * 1000
};

export async function getBoardData(options: BoardDataOptions = {}): Promise<BoardPayload> {
  await loadSourceCacheFromDisk();

  const selectedSourceIds = normalizeSourceIds(options.sourceIds);

  if (options.refresh === "force" || options.refresh === "stale") {
    await refreshSources(options.refresh, { sourceIds: selectedSourceIds });
  }

  return buildBoardPayload({
    includeCatalog: options.includeCatalog,
    itemLimit: options.itemLimit,
    selectedSourceIds
  });
}

export function getSeedBoardData(): BoardPayload {
  const generatedAt = new Date().toISOString();
  const boardSources = sources.map((source) => normalizeSeedSource(source, generatedAt));

  return buildPayloadFromSources(boardSources, generatedAt);
}

export async function getSourceData(sourceId: string): Promise<BoardSource | undefined> {
  await loadSourceCacheFromDisk();

  return getCachedSource(sourceId) ?? getCompactBoardSource(sourceId) ?? getSeedSourceData(sourceId);
}

export async function getSourceItemsPage(
  sourceId: string,
  options: { page?: number; pageSize?: number; refresh?: RefreshMode } = {}
): Promise<SourceItemsPage | undefined> {
  await loadSourceCacheFromDisk();

  if (options.refresh === "force") {
    await refreshSource(sourceId, { force: true, intent: "manual" });
  }

  if (options.refresh === "stale") {
    await refreshSource(sourceId, { intent: "pagination" });
  }

  const source = getCachedSource(sourceId) ?? getCompactBoardSource(sourceId) ?? getSeedSourceData(sourceId);

  if (!source) {
    return undefined;
  }

  const page = normalizePositiveInteger(options.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(options.pageSize, sourcePageItemLimit), 20);
  const start = (page - 1) * pageSize;

  return {
    sourceId,
    page,
    pageSize,
    totalItems: source.items.length,
    items: source.items.slice(start, start + pageSize)
  };
}

export async function refreshSources(
  mode: Exclude<RefreshMode, "none">,
  options: { sourceIds?: string[] } = {}
) {
  await loadSourceCacheFromDisk();

  const sourceIds = normalizeSourceIds(options.sourceIds);

  await Promise.all(
    sourceIds.map((sourceId) =>
      refreshSource(sourceId, {
        force: mode === "force",
        intent: mode === "force" ? "force" : "page-open",
        skipDiskLoad: true
      })
    )
  );
}

export async function refreshSource(
  sourceId: string,
  options: { intent?: RefreshIntent; force?: boolean; skipDiskLoad?: boolean } = {}
): Promise<RefreshResult> {
  if (!options.skipDiskLoad) {
    await loadSourceCacheFromDisk();
  }

  const connector = getConnector(sourceId);
  const sourceManifest = sourceCatalogById.get(sourceId);
  const now = Date.now();
  const compactEntry = getCompactSourceCache(sourceId);
  const existingEntry = sourceCache.get(sourceId);
  const isRuntimeFresh = existingEntry ? isCacheFresh(existingEntry, now) : false;
  const isCompactFresh = compactEntry ? now < compactEntry.expiresAt : false;

  if (!sourceManifest) {
    return {
      error: "Source was not found.",
      itemsFound: 0,
      itemsSaved: 0,
      sourceId,
      status: "error"
    };
  }

  const sourceConfig = sourceConfigById.get(sourceId);

  if (!sourceConfig) {
    return {
      error: "Source was not found.",
      itemsFound: 0,
      itemsSaved: 0,
      sourceId,
      status: "error"
    };
  }

  const decision = decideSourceRefresh(
    sourceManifest,
    options.force ? "force" : (options.intent ?? "manual"),
    {
      backoffUntil: compactEntry?.backoffUntil,
      hasConnector: Boolean(connector),
      isCacheFresh: isRuntimeFresh || isCompactFresh,
      lastSuccessAt: compactEntry?.lastSuccessAt,
      now
    }
  );

  if (!decision.shouldFetch) {
    return {
      error: decision.reason,
      itemsFound: 0,
      itemsSaved: 0,
      reason: decision.reason,
      sourceId,
      status: "skipped"
    };
  }

  if (!connector) {
    return {
      error: decision.reason,
      itemsFound: 0,
      itemsSaved: 0,
      reason: decision.reason,
      sourceId,
      status: "skipped"
    };
  }

  try {
    const fetchedItems = await connector.fetchItems();

    if (!fetchedItems.length) {
      throw new Error(`${connector.label} returned no items`);
    }

    const updatedAt = new Date().toISOString();
    const source = normalizeFetchedSource(sourceConfig, fetchedItems, updatedAt);
    const updatedAtMs = Date.now();
    const expiresAt = updatedAtMs + getSourceTtlMs(sourceId);
    const sourceWithDiagnostic = withSourceDiagnostic(source, {
      cacheExpiresAt: new Date(expiresAt).toISOString(),
      itemCount: source.items.length,
      mode: "live",
      updatedAt
    });

    sourceCache.set(sourceId, {
      expiresAt,
      mode: "live",
      source: sourceWithDiagnostic,
      updatedAt: updatedAtMs
    });
    setCompactSourceCache({
      expiresAt,
      lastSuccessAt: updatedAtMs,
      source: sourceWithDiagnostic,
      sourceId,
      updatedAt: updatedAtMs
    });
    await persistSourceCacheToDisk();

    return {
      fetchRunId: `cache-${sourceId}-${updatedAtMs}`,
      itemsFound: fetchedItems.length,
      itemsSaved: sourceWithDiagnostic.items.length,
      sourceId,
      status: "success"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh error";
    const fallbackUpdatedAt = Date.now();
    const fallbackExpiresAt = fallbackUpdatedAt + errorCacheTtlMs;
    const cachedFallback =
      existingEntry?.source ??
      (compactEntry ? getCompactBoardSource(sourceId) : undefined) ??
      normalizeSeedSource(sourceConfig, new Date().toISOString());
    const fallbackSource = markSourceError(
      cachedFallback,
      message
    );

    sourceCache.set(sourceId, {
      error: message,
      expiresAt: fallbackExpiresAt,
      mode: "fallback",
      source: fallbackSource,
      updatedAt: fallbackUpdatedAt
    });
    setCompactSourceCache({
      backoffUntil: fallbackUpdatedAt + failureBackoffMs,
      error: message,
      expiresAt: fallbackExpiresAt,
      lastSuccessAt: compactEntry?.lastSuccessAt,
      source: fallbackSource,
      sourceId,
      updatedAt: fallbackUpdatedAt
    });
    await persistSourceCacheToDisk();

    return {
      error: message,
      fetchRunId: `cache-${sourceId}-${fallbackUpdatedAt}`,
      itemsFound: 0,
      itemsSaved: 0,
      sourceId,
      status: "error"
    };
  }
}

export function getSeedSourceData(sourceId: string): BoardSource | undefined {
  const source = sourceConfigById.get(sourceId);
  return source ? normalizeSeedSource(source, new Date().toISOString()) : undefined;
}

export function validateRequestedSourceIds(sourceIds: string[]) {
  return normalizeSourceIds(sourceIds);
}

export async function getItemById(itemId: string): Promise<BoardItem | undefined> {
  await loadSourceCacheFromDisk();

  return getCachedItemById(itemId) ?? getSeedItemById(itemId);
}

export async function recordClick() {
  // Click logging intentionally does nothing in the no-database runtime.
}

function buildBoardPayload(options: {
  includeCatalog?: boolean;
  itemLimit?: number;
  selectedSourceIds: string[];
}) {
  const generatedAt = new Date().toISOString();
  const payloadSourceIds = options.includeCatalog
    ? catalogSources.map((source) => source.id).slice(0, maxBoardSources)
    : options.selectedSourceIds;
  const boardSources = payloadSourceIds.map(
    (sourceId) => getBoardSourceFromCache(sourceId, generatedAt)
  );

  return buildPayloadFromSources(boardSources, generatedAt, normalizeItemLimit(options.itemLimit));
}

function buildPayloadFromSources(
  boardSources: BoardSource[],
  generatedAt: string,
  itemLimit = boardItemLimit
): BoardPayload {
  const limitedSources = boardSources.map((source) => limitBoardSourceItems(source, itemLimit));

  return {
    generatedAt,
    itemCount: limitedSources.reduce((count, source) => count + source.items.length, 0),
    sourceCount: limitedSources.length,
    sources: limitedSources
  };
}

function getCachedSource(sourceId: string) {
  return sourceCache.get(sourceId)?.source;
}

function getBoardSourceFromCache(sourceId: string, generatedAt: string): BoardSource {
  const sourceConfig = sourceConfigById.get(sourceId);
  const source =
    getCachedSource(sourceId) ??
    getCompactBoardSource(sourceId) ??
    (sourceConfig ? normalizeSeedSource(sourceConfig, generatedAt) : undefined);

  if (!source) {
    throw new Error(`Cannot build payload for unknown source ${sourceId}`);
  }

  return source;
}

function getCachedItemById(itemId: string) {
  const runtimeItem = Array.from(sourceCache.values())
    .flatMap((entry) => entry.source.items)
    .find((item) => item.id === itemId);

  if (runtimeItem) {
    return runtimeItem;
  }

  return listCompactSourceCache()
    .flatMap((entry) => entry.source.items)
    .find((item) => item.id === itemId);
}

function getSeedItemById(itemId: string): BoardItem | undefined {
  return getSeedBoardData()
    .sources.flatMap((source) => source.items)
    .find((item) => item.id === itemId);
}

function normalizeFetchedSource(
  source: (typeof catalogSources)[number],
  items: FetchedItem[],
  updatedAt: string
): BoardSource {
  const baseSource = normalizeSeedSource(source, updatedAt);
  const fetchedBoardItems = items.slice(0, sourceItemLimit).map((item, index) => {
    const originalUrl = normalizeUrl(item.url, baseSource.homeUrl);
    const id = `${source.id}-${hashContent(source.id, item.title, originalUrl).slice(0, 16)}`;

    return {
      id,
      metric: item.metric ?? (index === 0 ? "新" : `${index + 1}`),
      originalUrl,
      publishedAt: item.publishedAt,
      sourceId: source.id,
      sourceName: source.name,
      summary: item.summary ?? "",
      title: item.title,
      url: originalUrl
    };
  });

  return {
    ...baseSource,
    footer: formatSourceFooter(updatedAt, source.footer),
    items: fetchedBoardItems,
    status: "ok"
  };
}

function normalizeSeedSource(source: (typeof catalogSources)[number], updatedAt: string): BoardSource {
  const categoryKey = categoryKeyByLabel.get(source.category);

  if (!categoryKey) {
    throw new Error(`Missing category key for ${source.category}`);
  }

  const homeUrl = sourceHomeUrls[source.id] ?? "#";

  const seedSource: BoardSource = {
    ...source,
    categoryKey,
    diagnostic: {
      itemCount: Math.min(source.items.length, sourceItemLimit),
      mode: "seed",
      updatedAt
    },
    footer: formatSourceFooter(updatedAt, source.footer),
    homeUrl,
    status: "ok",
    updatedAt,
    items: source.items.slice(0, sourceItemLimit).map((item, index) => {
      const originalUrl = item.url === "#" ? homeUrl : item.url;
      const id = `${source.id}-${index + 1}`;

      return {
        ...item,
        id,
        originalUrl,
        sourceId: source.id,
        sourceName: source.name,
        url: originalUrl
      };
    })
  };

  return seedSource;
}

function markSourceError(source: BoardSource, errorMessage: string): BoardSource {
  const updatedAt = new Date().toISOString();
  const fallbackSource: BoardSource = {
    ...source,
    footer: `${source.footer.replace(/\s*·\s*刷新失败.*$/, "")} · 刷新失败`,
    status: "error",
    updatedAt,
    items: source.items.length
      ? source.items
      : (getSeedSourceData(source.id)?.items ?? []),
    board: source.board,
    homeUrl: source.homeUrl,
    name: source.name,
    logo: source.logo,
    tone: source.tone,
    category: source.category,
    categoryKey: source.categoryKey,
    id: source.id
  };

  return withSourceDiagnostic(fallbackSource, {
    errorMessage,
    itemCount: fallbackSource.items.length,
    mode: "fallback",
    updatedAt
  });
}

function withSourceDiagnostic(
  source: BoardSource,
  diagnostic: BoardSource["diagnostic"]
): BoardSource {
  return {
    ...source,
    diagnostic
  };
}

function formatSourceFooter(updatedAt: string, hint?: string) {
  const timeText = new Date(updatedAt).toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  });
  const normalizedHint = hint
    ?.replace(/^\d+\s*(?:分钟|小时)前更新\s*·\s*/, "")
    .replace(/^今日\s+\d{2}:\d{2}\s*·\s*/, "")
    .replace(/^实时\s*·\s*/, "")
    .replace(/^5分钟自动刷新$/, "按需刷新")
    .replace(/^打开\/手动刷新时更新$/, "按需刷新")
    .trim();

  return `${timeText} 更新${normalizedHint ? ` · ${normalizedHint}` : ""}`;
}

function getSourceTtlMs(sourceId: string) {
  return sourceCacheTtlMs[sourceId] ?? defaultCacheTtlMs;
}

function isCacheFresh(entry: SourceCacheEntry, now = Date.now()) {
  return now < entry.expiresAt;
}

function normalizeSourceIds(sourceIds?: string[]) {
  const requestedIds = sourceIds?.length ? sourceIds : sources.map((source) => source.id);
  const uniqueIds = new Set<string>();

  for (const sourceId of requestedIds) {
    const normalizedId = sourceId.trim();

    if (sourceConfigById.has(normalizedId)) {
      uniqueIds.add(normalizedId);
    }
  }

  return Array.from(uniqueIds).slice(0, maxBoardSources);
}

function normalizeItemLimit(itemLimit?: number) {
  return Number.isFinite(itemLimit) && itemLimit !== undefined && itemLimit > 0
    ? Math.floor(itemLimit)
    : boardItemLimit;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback;
}

function limitBoardSourceItems(source: BoardSource, itemLimit: number): BoardSource {
  const items = source.items.slice(0, itemLimit);

  return {
    ...source,
    diagnostic: {
      ...source.diagnostic,
      itemCount: source.items.length
    },
    items
  };
}

function getEnvSeconds(key: string, fallback: number) {
  return getPositiveIntegerEnv(key, fallback);
}

function getPositiveIntegerEnv(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hashContent(sourceId: string, title: string, url: string) {
  return createHash("sha256").update(`${sourceId}\n${title}\n${url}`).digest("hex");
}

function normalizeUrl(url: string, baseUrl: string) {
  return new URL(url, baseUrl).toString();
}
