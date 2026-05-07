import { createHash } from "node:crypto";
import { categories, sourceHomeUrls, sources, type NewsCategory, type NewsItem, type SourceColor, type SourceDisplayType } from "@/lib/news-data";
import { getConnector } from "@/lib/connectors";
import type { FetchedItem } from "@/lib/connectors/types";

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

export type RefreshResult = {
  error?: string;
  fetchRunId?: string;
  itemsFound: number;
  itemsSaved: number;
  sourceId: string;
  status: "success" | "skipped" | "error";
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
const sourceConfigById = new Map(sources.map((source) => [source.id, source]));
const sourceCache = globalThis.__anyknewsSourceCache ?? new Map<string, SourceCacheEntry>();
globalThis.__anyknewsSourceCache = sourceCache;

const defaultCacheTtlMs = getEnvSeconds("ANYKNEWS_CACHE_TTL_SECONDS", 10 * 60) * 1000;
const errorCacheTtlMs = getEnvSeconds("ANYKNEWS_ERROR_CACHE_TTL_SECONDS", 2 * 60) * 1000;
const sourceItemLimit = getPositiveIntegerEnv("ANYKNEWS_SOURCE_ITEM_LIMIT", 50);
const sourceCacheTtlMs: Record<string, number> = {
  general: getEnvSeconds("ANYKNEWS_ZHIHU_CACHE_TTL_SECONDS", 2 * 60) * 1000,
  tech: getEnvSeconds("ANYKNEWS_GITHUB_CACHE_TTL_SECONDS", 60 * 60) * 1000
};

export async function getBoardData(
  options: { refresh?: RefreshMode } = {}
): Promise<BoardPayload> {
  if (options.refresh === "force" || options.refresh === "stale") {
    await refreshSources(options.refresh);
  }

  return buildBoardPayload();
}

export function getSeedBoardData(): BoardPayload {
  const generatedAt = new Date().toISOString();
  const boardSources = sources.map((source) => normalizeSeedSource(source, generatedAt));

  return buildPayloadFromSources(boardSources, generatedAt);
}

export async function getSourceData(sourceId: string): Promise<BoardSource | undefined> {
  return getCachedSource(sourceId) ?? getSeedSourceData(sourceId);
}

export async function refreshSources(mode: Exclude<RefreshMode, "none">) {
  await Promise.all(
    sources.map((source) =>
      refreshSource(source.id, {
        force: mode === "force"
      })
    )
  );
}

export async function refreshSource(
  sourceId: string,
  options: { force?: boolean } = {}
): Promise<RefreshResult> {
  const connector = getConnector(sourceId);

  if (!connector) {
    return {
      itemsFound: 0,
      itemsSaved: 0,
      sourceId,
      status: "skipped"
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

  const existingEntry = sourceCache.get(sourceId);

  if (!options.force && existingEntry && isCacheFresh(existingEntry)) {
    return {
      itemsFound: 0,
      itemsSaved: 0,
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
    const expiresAt = Date.now() + getSourceTtlMs(sourceId);
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
      updatedAt: Date.now()
    });

    return {
      fetchRunId: `cache-${sourceId}-${Date.now()}`,
      itemsFound: fetchedItems.length,
      itemsSaved: sourceWithDiagnostic.items.length,
      sourceId,
      status: "success"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh error";
    const cachedFallback = existingEntry?.source ?? normalizeSeedSource(sourceConfig, new Date().toISOString());
    const fallbackSource = markSourceError(
      cachedFallback,
      message
    );

    sourceCache.set(sourceId, {
      error: message,
      expiresAt: Date.now() + errorCacheTtlMs,
      mode: "fallback",
      source: fallbackSource,
      updatedAt: Date.now()
    });

    return {
      error: message,
      fetchRunId: `cache-${sourceId}-${Date.now()}`,
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

export async function getItemById(itemId: string): Promise<BoardItem | undefined> {
  return getCachedItemById(itemId) ?? getSeedItemById(itemId);
}

export async function recordClick() {
  // Click logging intentionally does nothing in the no-database runtime.
}

function buildBoardPayload() {
  const generatedAt = new Date().toISOString();
  const boardSources = sources.map(
    (source) => getCachedSource(source.id) ?? normalizeSeedSource(source, generatedAt)
  );

  return buildPayloadFromSources(boardSources, generatedAt);
}

function buildPayloadFromSources(boardSources: BoardSource[], generatedAt: string): BoardPayload {
  return {
    generatedAt,
    itemCount: boardSources.reduce((count, source) => count + source.items.length, 0),
    sourceCount: boardSources.length,
    sources: boardSources
  };
}

function getCachedSource(sourceId: string) {
  return sourceCache.get(sourceId)?.source;
}

function getCachedItemById(itemId: string) {
  return Array.from(sourceCache.values())
    .flatMap((entry) => entry.source.items)
    .find((item) => item.id === itemId);
}

function getSeedItemById(itemId: string): BoardItem | undefined {
  return getSeedBoardData()
    .sources.flatMap((source) => source.items)
    .find((item) => item.id === itemId);
}

function normalizeFetchedSource(
  source: (typeof sources)[number],
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

function normalizeSeedSource(source: (typeof sources)[number], updatedAt: string): BoardSource {
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

function isCacheFresh(entry: SourceCacheEntry) {
  return Date.now() < entry.expiresAt;
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
