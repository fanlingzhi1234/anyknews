"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Minus,
  Plus,
  RefreshCcw,
  Search,
  Star
} from "lucide-react";
import { type BoardPayload, type BoardSource, type RefreshMode } from "@/lib/board-service";
import { catalogSources, categories } from "@/lib/news-data";

type NewsBoardProps = {
  initialBoard: BoardPayload;
};

const CARD_ITEMS_PER_PAGE = 8;
const PREFERENCES_STORAGE_KEY = "anyknews.preferences.v2";
const LEGACY_PREFERENCES_STORAGE_KEY = "anyknews.preferences.v1";
const TREND_SNAPSHOT_STORAGE_KEY = "anyknews.trend-snapshot.v1";

type ViewMode = "subscriptions" | "all" | "subscription-settings";
type ActiveCategory = "subscriptions" | "all" | (typeof categories)[number]["anchor"];

type LocalPreferences = {
  favoriteItemIds: string[];
  hiddenItemIds: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  showHidden: boolean;
  subscribedSourceIds: string[];
  hiddenSourceIds: string[];
  sourceOrder: string[];
  defaultView: "subscriptions" | "all";
  collapsedSourceIds: string[];
};

type TrendSnapshot = {
  capturedAt: string;
  topicItemIds: Record<string, string[]>;
};

type TrendChange = {
  count: number;
  label: string;
  newCount: number;
  previousCount: number;
  sourceCount: number;
};

type LoadBoardOptions = {
  force?: boolean;
  includeCatalog?: boolean;
  refresh?: RefreshMode;
  sourceIds?: string[];
};

type SourcePageLoadResult = {
  loaded: boolean;
  receivedItemCount: number;
  totalItems: number;
};

const defaultPreferences: LocalPreferences = {
  favoriteItemIds: [],
  hiddenItemIds: [],
  includeKeywords: ["AI agent", "机器人", "项目管理"],
  excludeKeywords: [],
  showHidden: false,
  subscribedSourceIds: [],
  hiddenSourceIds: [],
  sourceOrder: [],
  defaultView: "subscriptions",
  collapsedSourceIds: []
};

const TREND_TOPICS = [
  { label: "AI Agent", pattern: /ai\s*agent|智能体|agent/i },
  { label: "机器人", pattern: /机器人|具身|自动驾驶|无人车/i },
  { label: "项目管理", pattern: /项目管理|协同|工作流|流程|排期/i },
  { label: "模型与算力", pattern: /模型|算力|推理|大模型|token/i },
  { label: "汽车科技", pattern: /汽车|新能源|车企|自动驾驶/i },
  { label: "资本市场", pattern: /融资|财报|美股|a股|估值|投资/i }
];

export function NewsBoard({ initialBoard }: NewsBoardProps) {
  const [board, setBoard] = useState(initialBoard);
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>("subscriptions");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null);
  const [loadingPageSourceId, setLoadingPageSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("subscriptions");
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [preferences, setPreferences] = useState<LocalPreferences>(() =>
    normalizePreferences(defaultPreferences, initialBoard.sources)
  );
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [draggingSourceId, setDraggingSourceId] = useState<string | null>(null);
  const [trendChanges, setTrendChanges] = useState<TrendChange[]>([]);
  const normalizedPreferences = useMemo(
    () => normalizePreferences(preferences, board.sources),
    [board.sources, preferences]
  );
  const normalizedPreferencesRef = useRef(normalizedPreferences);
  const hasSyncedLoadedPreferencesRef = useRef(false);
  const contentBoard = useMemo(
    () => getSubscribedBoard(board, normalizedPreferences),
    [board, normalizedPreferences]
  );
  const displayBaseSources = useMemo(
    () => viewMode === "subscriptions" ? contentBoard.sources : board.sources,
    [board.sources, contentBoard.sources, viewMode]
  );
  const displayBoard = useMemo(
    () => ({
      ...board,
      itemCount: displayBaseSources.reduce((count, source) => count + source.items.length, 0),
      sourceCount: displayBaseSources.length,
      sources: displayBaseSources
    }),
    [board, displayBaseSources]
  );
  const statusStats = getStatusStats(displayBoard);
  const personalizedSources = useMemo(
    () => applyPreferences(displayBaseSources, normalizedPreferences, viewMode),
    [displayBaseSources, normalizedPreferences, viewMode]
  );
  const categoryFilteredSources = useMemo(
    () => filterSourcesByCategory(personalizedSources, activeCategory),
    [activeCategory, personalizedSources]
  );
  const filteredSources = categoryFilteredSources;
  const visibleItemCount = filteredSources.reduce(
    (count, source) => count + source.items.length,
    0
  );
  const preferenceCounts = useMemo(() => getPreferenceCounts(normalizedPreferences), [normalizedPreferences]);
  const trendInsights = useMemo(
    () => buildTrendInsights(applyPreferences(contentBoard.sources, normalizedPreferences, "all")),
    [contentBoard.sources, normalizedPreferences]
  );
  const eventClusters = useMemo(
    () => buildEventClusters(applyPreferences(contentBoard.sources, normalizedPreferences, "all")),
    [contentBoard.sources, normalizedPreferences]
  );
  const diagnostics = useMemo(() => buildDiagnostics(contentBoard), [contentBoard]);
  const activeScopeLabel = getActiveScopeLabel(activeCategory, viewMode);
  const managedSources = useMemo(
    () => orderSources(board.sources, normalizedPreferences.sourceOrder),
    [board.sources, normalizedPreferences.sourceOrder]
  );
  const hasFullCatalog = board.sources.length >= catalogSources.length;

  useEffect(() => {
    normalizedPreferencesRef.current = normalizedPreferences;
  }, [normalizedPreferences]);

  useEffect(() => {
    setPreferences(loadLocalPreferences(initialBoard.sources));
    setHasLoadedPreferences(true);
  }, [initialBoard.sources]);

  useEffect(() => {
    if (!hasLoadedPreferences) {
      return;
    }

    const nextPreferences = normalizePreferences(preferences, board.sources);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences));

    if (JSON.stringify(nextPreferences) !== JSON.stringify(preferences)) {
      setPreferences(nextPreferences);
    }
  }, [board.sources, hasLoadedPreferences, preferences]);

  useEffect(() => {
    const snapshot = buildTrendSnapshot(contentBoard.sources);
    const previousSnapshot = loadTrendSnapshot();

    setTrendChanges(buildTrendChanges(snapshot, previousSnapshot, contentBoard.sources));
    window.localStorage.setItem(TREND_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  }, [contentBoard.sources]);

  const loadBoard = useCallback(async (options: LoadBoardOptions = {}) => {
    const force = Boolean(options.force);
    const includeCatalog = options.includeCatalog ?? false;
    const refresh = options.refresh ?? (force ? "force" : "stale");
    const subscribedSourceIds = normalizedPreferencesRef.current.subscribedSourceIds;
    const requestedSourceIds = options.sourceIds ?? subscribedSourceIds;

    setIsLoading(true);
    setError(null);
    setRefreshSummary(null);

    try {
      if (!requestedSourceIds.length && !includeCatalog) {
        setBoard((current) => ({
          ...current,
          generatedAt: new Date().toISOString(),
          itemCount: 0,
          sourceCount: 0,
          sources: []
        }));
        return;
      }

      const params = new URLSearchParams({
        itemLimit: String(CARD_ITEMS_PER_PAGE),
        refresh
      });

      if (requestedSourceIds.length) {
        params.set("sourceIds", requestedSourceIds.join(","));
      }

      if (includeCatalog) {
        params.set("includeCatalog", "true");
      }

      const response = await fetch(`/api/boards?${params.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`GET /api/boards failed with ${response.status}`);
      }

      const nextBoard = (await response.json()) as BoardPayload;
      setBoard(nextBoard);

      if (force) {
        const nextStats = getStatusStats(nextBoard);
        setRefreshSummary(
          `刷新完成：${nextStats.ok} 个来源成功${nextStats.error ? `，${nextStats.error} 个使用兜底` : ""}`
        );
      }
    } catch {
      setError("数据刷新失败，正在显示上一次成功结果");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedPreferences || hasSyncedLoadedPreferencesRef.current) {
      return;
    }

    const currentSourceIds = new Set(board.sources.map((source) => source.id));
    const hasMissingSubscribedSource = normalizedPreferences.subscribedSourceIds.some(
      (sourceId) => !currentSourceIds.has(sourceId)
    );

    if (!hasMissingSubscribedSource) {
      hasSyncedLoadedPreferencesRef.current = true;
      return;
    }

    hasSyncedLoadedPreferencesRef.current = true;
    void loadBoard({ includeCatalog: true, refresh: "none" });
  }, [board.sources, hasLoadedPreferences, loadBoard, normalizedPreferences.subscribedSourceIds]);

  useEffect(() => {
    if (!hasLoadedPreferences) {
      return;
    }

    void loadBoard();
  }, [hasLoadedPreferences, loadBoard]);

  useEffect(() => {
    if ((viewMode !== "subscriptions" || activeCategory !== "subscriptions") && !hasFullCatalog) {
      void loadBoard({ includeCatalog: true, refresh: "none" });
    }
  }, [activeCategory, hasFullCatalog, loadBoard, viewMode]);

  async function refreshSource(sourceId: string) {
    setRefreshingSourceId(sourceId);
    setError(null);
    setRefreshSummary(null);

    try {
      const response = await fetch(`/api/sources/${sourceId}/refresh`, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`POST refresh failed with ${response.status}`);
      }

      const payload = (await response.json()) as { source: BoardSource };
      const sourceName = payload.source.name;
      setBoard((current) => ({
        ...current,
        generatedAt: new Date().toISOString(),
        sources: current.sources.map((source) =>
          source.id === sourceId ? payload.source : source
        )
      }));
      setRefreshSummary(
        payload.source.status === "error"
          ? `${sourceName} 刷新失败，正在使用兜底数据`
          : `${sourceName} 已刷新`
      );
    } catch {
      setError("单源刷新失败，已保留当前列表");
    } finally {
      setRefreshingSourceId(null);
    }
  }

  async function loadSourcePage(sourceId: string, page: number): Promise<SourcePageLoadResult> {
    setLoadingPageSourceId(sourceId);
    setError(null);

    try {
      const response = await fetch(
        `/api/sources/${sourceId}/items?page=${page}&pageSize=${CARD_ITEMS_PER_PAGE}&refresh=stale`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(`GET /api/sources/${sourceId}/items failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        items: BoardSource["items"];
        totalItems: number;
      };

      setBoard((current) => ({
        ...current,
        generatedAt: new Date().toISOString(),
        sources: current.sources.map((source) =>
          source.id === sourceId ? mergeSourcePage(source, payload.items, payload.totalItems) : source
        )
      }));

      return {
        loaded: true,
        receivedItemCount: payload.items.length,
        totalItems: payload.totalItems
      };
    } catch {
      setError("加载更多内容失败，正在显示已缓存内容");
      return {
        loaded: false,
        receivedItemCount: 0,
        totalItems: 0
      };
    } finally {
      setLoadingPageSourceId(null);
    }
  }

  async function refreshProblemSources() {
    const problemSources = board.sources.filter((source) => source.status === "error");
    const targets = problemSources.length ? problemSources : board.sources;

    setIsLoading(true);
    setError(null);
    setRefreshSummary(null);

    try {
      for (const source of targets) {
        await refreshSource(source.id);
      }

      setRefreshSummary(
        problemSources.length
          ? `已重试 ${problemSources.length} 个异常来源`
          : "没有异常来源，已按来源逐个刷新"
      );
    } catch {
      setError("异常源重试失败，已保留当前列表");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSourceSubscription(sourceId: string) {
    setPreferences((current) => {
      const normalized = normalizePreferences(current, board.sources);
      const sourceSet = new Set(normalized.subscribedSourceIds);
      let sourceOrder = normalized.sourceOrder;
      const sourceById = getSourceById(board.sources);

      if (sourceSet.has(sourceId)) {
        sourceSet.delete(sourceId);
      } else {
        sourceSet.add(sourceId);
        sourceOrder = moveAfterCategorySubscriptions(sourceOrder, sourceId, sourceSet, sourceById);
      }

      return {
        ...normalized,
        sourceOrder,
        subscribedSourceIds: sourceOrder.filter((id) => sourceSet.has(id))
      };
    });
  }

  function placeSourceInSubscriptions(activeSourceId: string, overSourceId?: string) {
    if (activeSourceId === overSourceId) {
      return;
    }

    setPreferences((current) => {
      const normalized = normalizePreferences(current, board.sources);
      const subscribedSet = new Set(normalized.subscribedSourceIds);
      const sourceById = getSourceById(board.sources);

      if (!normalized.sourceOrder.includes(activeSourceId)) {
        return normalized;
      }

      subscribedSet.add(activeSourceId);

      const nextOrder = overSourceId
        ? moveBefore(normalized.sourceOrder, activeSourceId, overSourceId)
        : moveAfterCategorySubscriptions(normalized.sourceOrder, activeSourceId, subscribedSet, sourceById);

      return {
        ...normalized,
        sourceOrder: nextOrder,
        subscribedSourceIds: nextOrder.filter((id) => subscribedSet.has(id))
      };
    });
  }

  function addCategorySubscriptions(sourceIds: string[]) {
    if (!sourceIds.length) {
      return;
    }

    setPreferences((current) => {
      const normalized = normalizePreferences(current, board.sources);
      const subscribedSet = new Set(normalized.subscribedSourceIds);
      const sourceById = getSourceById(board.sources);
      let sourceOrder = normalized.sourceOrder;

      for (const sourceId of sourceIds) {
        if (!sourceById.has(sourceId)) {
          continue;
        }

        subscribedSet.add(sourceId);
        sourceOrder = moveAfterCategorySubscriptions(sourceOrder, sourceId, subscribedSet, sourceById);
      }

      return {
        ...normalized,
        sourceOrder,
        subscribedSourceIds: sourceOrder.filter((id) => subscribedSet.has(id))
      };
    });
  }

  function resetSourcePreferences() {
    const defaultSourceIds = getDefaultSourceIds(board.sources);
    const defaultSubscribedIds = getDefaultSubscribedSourceIds(board.sources);
    const defaultSubscribedSet = new Set(defaultSubscribedIds);

    setPreferences((current) => ({
      ...normalizePreferences(current, board.sources),
      hiddenSourceIds: [],
      sourceOrder: defaultSourceIds,
      subscribedSourceIds: defaultSourceIds.filter((sourceId) => defaultSubscribedSet.has(sourceId))
    }));
  }

  function openSubscriptionsView() {
    setViewMode("subscriptions");
    setActiveCategory("subscriptions");
    scrollToTop();
  }

  function openSubscriptionSettings() {
    setViewMode("subscription-settings");
    setActiveCategory("all");
    scrollToTop();

    if (!hasFullCatalog) {
      void loadBoard({ includeCatalog: true, refresh: "none" });
    }
  }

  function openCatalogView(nextCategory: ActiveCategory) {
    setViewMode("all");
    setActiveCategory(nextCategory);
    scrollToTop();

    const sourceIds = getCatalogSourceIdsForScope(nextCategory, "all");

    if (!sourceIds.length) {
      return;
    }

    void loadBoard({
      includeCatalog: true,
      refresh: "force",
      sourceIds
    });
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AnyKnews 首页">
          <span className="brandMark">A</span>
          <span>AnyKnews</span>
        </a>
        <nav className="nav" aria-label="分类">
          <a
            aria-current={viewMode === "subscriptions" ? "page" : undefined}
            className={viewMode === "subscriptions" ? "navActive" : undefined}
            href="#top"
            onClick={(event) => {
              event.preventDefault();
              openSubscriptionsView();
            }}
          >
            我的订阅
          </a>
          <a
            aria-current={viewMode === "subscription-settings" ? "page" : undefined}
            className={viewMode === "subscription-settings" ? "navActive" : undefined}
            href="#subscription-settings"
            onClick={(event) => {
              event.preventDefault();
              openSubscriptionSettings();
            }}
          >
            订阅设置
          </a>
          {categories.map((category) => (
            <a
              aria-current={viewMode === "all" && activeCategory === category.anchor ? "page" : undefined}
              className={viewMode === "all" && activeCategory === category.anchor ? "navActive" : undefined}
              href={`#${category.anchor}`}
              key={category.anchor}
              onClick={(event) => {
                event.preventDefault();
                openCatalogView(category.anchor as ActiveCategory);
              }}
            >
              {category.label}
            </a>
          ))}
        </nav>
        <div className="actions">
          <span className={`statusPill ${statusStats.error ? "statusPill-warn" : ""}`}>
            <span className="statusDot" />
            {statusStats.ok}/{displayBoard.sourceCount} 可用
          </span>
          <button
            className="iconButton"
            aria-label="刷新当前页面"
            disabled={isLoading}
            onClick={() => void loadBoard({ force: true })}
            title="刷新当前页面"
            type="button"
          >
            <RefreshCcw className={isLoading ? "spin" : ""} size={18} strokeWidth={2.4} />
          </button>
        </div>
      </header>

      <main className="main" id="top">
        <div className="boardMeta">
          <div>
            <strong>{viewMode === "subscription-settings" ? "订阅设置" : "今日热榜"}</strong>
            <span>
              {viewMode === "subscription-settings"
                ? `${preferenceCounts.subscribed} 个订阅 · ${board.sources.length}/${catalogSources.length} 个来源`
                : `${filteredSources.length} 个来源 · ${visibleItemCount} 条 · ${statusStats.error} 个兜底`}
            </span>
          </div>
          <div>
            {viewMode === "subscription-settings"
              ? "拖拽排序 · 分类添加 · 来源预览"
              : `${activeScopeLabel} · 打开时更新 · AI日报 10:00`}
          </div>
        </div>
        {viewMode !== "subscription-settings" ? (
        <section className="insightDisclosure" aria-label="看板洞察">
          <button
            aria-expanded={isInsightsOpen}
            className="insightToggle"
            onClick={() => setIsInsightsOpen((current) => !current)}
            type="button"
          >
            <span>
              <strong>看板洞察</strong>
              <em>
                {diagnostics.ok} 个实时 · {diagnostics.fallback} 个兜底 · {diagnostics.itemCount} 条
              </em>
            </span>
            <ChevronDown
              className={isInsightsOpen ? "insightToggleIcon-open" : ""}
              size={15}
              strokeWidth={2.4}
            />
          </button>
          {isInsightsOpen ? (
            <>
              <section className="insightRail" aria-label="趋势和诊断">
                <div className="trendPanel">
                  <div className="panelTitle">
                    <BarChart3 size={16} strokeWidth={2.3} />
                    趋势雷达
                  </div>
                  <div className="trendList">
                    {trendChanges.length ? (
                      trendChanges.map((trend) => (
                        <div className="trendItem" key={trend.label}>
                          <strong>{trend.label}</strong>
                          <span>
                            {trend.count} 条 · {trend.sourceCount} 源
                            {trend.newCount ? ` · 新增 ${trend.newCount}` : ""}
                          </span>
                        </div>
                      ))
                    ) : trendInsights.length ? (
                      trendInsights.map((trend) => (
                        <div className="trendItem" key={trend.label}>
                          <strong>{trend.label}</strong>
                          <span>{trend.count} 条 · {trend.sourceCount} 源</span>
                        </div>
                      ))
                    ) : (
                      <span className="mutedText">暂无足够趋势信号</span>
                    )}
                  </div>
                </div>
                <div className="trendPanel eventPanel">
                  <div className="panelTitle">
                    <BarChart3 size={16} strokeWidth={2.3} />
                    事件聚合
                  </div>
                  <div className="eventList">
                    {eventClusters.length ? (
                      eventClusters.map((cluster) => (
                        <div className="eventCluster" key={cluster.label}>
                          <div>
                            <strong>{cluster.label}</strong>
                            <span>{cluster.items.length} 条 · {cluster.sourceCount} 源</span>
                          </div>
                          <p>{cluster.leadTitles.join(" / ")}</p>
                        </div>
                      ))
                    ) : (
                      <span className="mutedText">暂无可聚合事件</span>
                    )}
                  </div>
                </div>
                <div className="diagnosticPanel">
                  <div className="panelTitle">
                    <Activity size={16} strokeWidth={2.3} />
                    源诊断
                  </div>
                  <div className="diagnosticList">
                    <span>{diagnostics.ok} 个实时</span>
                    <span>{diagnostics.fallback} 个兜底</span>
                    <span>{diagnostics.seed} 个种子</span>
                    <span>{diagnostics.itemCount} 条可读</span>
                    <span>{diagnostics.updatedAt}</span>
                  </div>
                  <div className="diagnosticActions">
                    <button
                      disabled={isLoading}
                      onClick={() => void refreshProblemSources()}
                      type="button"
                    >
                      重试异常源
                    </button>
                    <button
                      aria-expanded={isDiagnosticsOpen}
                      className={isDiagnosticsOpen ? "active" : ""}
                      onClick={() => setIsDiagnosticsOpen((current) => !current)}
                      type="button"
                    >
                      明细
                    </button>
                    <a href="/api/health" rel="noopener noreferrer" target="_blank">
                      健康接口
                    </a>
                  </div>
                </div>
              </section>
              {isDiagnosticsOpen ? (
                <section className="sourceDiagnostics" aria-label="数据源诊断明细">
                  {contentBoard.sources.map((source) => (
                    <div className="sourceDiagnosticRow" key={source.id}>
                      <div>
                        <strong>{source.name}</strong>
                        <span>{source.category} · {source.items.length} 条</span>
                      </div>
                      <span className={`diagnosticMode diagnosticMode-${source.diagnostic.mode}`}>
                        {formatDiagnosticMode(source.diagnostic.mode)}
                      </span>
                      <span>{formatDiagnosticTime(source.updatedAt)}</span>
                      <span title={source.diagnostic.errorMessage}>
                        {source.diagnostic.errorMessage ?? "正常"}
                      </span>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          ) : null}
        </section>
        ) : null}
        {refreshSummary ? (
          <div className="inlineNotice" role="status" aria-live="polite">
            {refreshSummary}
          </div>
        ) : null}
        {error ? (
          <div className="inlineError" role="status" aria-live="polite">
            <AlertCircle size={15} strokeWidth={2.3} />
            {error}
          </div>
        ) : null}
        {viewMode === "subscription-settings" ? (
          <SubscriptionSettingsPage
            draggingSourceId={draggingSourceId}
            onDragEnd={() => setDraggingSourceId(null)}
            onDragStart={setDraggingSourceId}
            onDropInSubscribed={placeSourceInSubscriptions}
            onReset={resetSourcePreferences}
            onAddCategorySubscriptions={addCategorySubscriptions}
            onToggleSubscription={toggleSourceSubscription}
            preferences={normalizedPreferences}
            sources={managedSources}
          />
        ) : filteredSources.length ? (
          <section className="boardGrid" aria-label="信息源卡片">
            {filteredSources.map((source) => (
              <SourceCard
                isPageLoading={loadingPageSourceId === source.id}
                isRefreshing={refreshingSourceId === source.id}
                key={source.id}
                onLoadPage={loadSourcePage}
                onRefresh={refreshSource}
                source={source}
              />
            ))}
          </section>
        ) : (
          <section className="emptyState" role="status" aria-live="polite">
            <Search size={22} strokeWidth={2.1} />
            <strong>没有匹配的信息</strong>
            <span>当前分类暂无已加载来源，可切到订阅设置添加更多信息源。</span>
          </section>
        )}
      </main>
    </>
  );
}

function SourceCard({
  isPageLoading,
  isRefreshing,
  onLoadPage,
  onRefresh,
  source
}: {
  isPageLoading: boolean;
  isRefreshing: boolean;
  onLoadPage: (sourceId: string, page: number) => Promise<SourcePageLoadResult>;
  onRefresh: (sourceId: string) => Promise<void>;
  source: BoardSource;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [knownLastPage, setKnownLastPage] = useState<number | null>(null);
  const previousUpdatedAtRef = useRef(source.updatedAt);
  const totalItems = Math.max(source.items.length, source.diagnostic.itemCount);
  const knownTotalPages = Math.max(1, Math.ceil(totalItems / CARD_ITEMS_PER_PAGE));
  const canProbeNextPage = source.status === "ok" && knownLastPage === null;
  const totalPages = knownLastPage ?? Math.max(
    knownTotalPages,
    canProbeNextPage ? currentPage + 2 : currentPage + 1
  );
  const pageStart = currentPage * CARD_ITEMS_PER_PAGE;
  const pageItems = source.items.slice(pageStart, pageStart + CARD_ITEMS_PER_PAGE);
  const canPage = totalItems > CARD_ITEMS_PER_PAGE || currentPage > 0 || canProbeNextPage;

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(knownTotalPages - 1, 0)));
  }, [knownTotalPages, source.id]);

  useEffect(() => {
    if (previousUpdatedAtRef.current === source.updatedAt) {
      return;
    }

    previousUpdatedAtRef.current = source.updatedAt;
    setKnownLastPage(null);
    setCurrentPage(0);
  }, [source.updatedAt]);

  useEffect(() => {
    if (isRefreshing) {
      setKnownLastPage(null);
      setCurrentPage(0);
    }
  }, [isRefreshing]);

  async function goToPage(nextPage: number) {
    const clampedPage = Math.max(0, Math.min(totalPages - 1, nextPage));
    const loadedItemCount = source.items.length;
    const neededItemCount = (clampedPage + 1) * CARD_ITEMS_PER_PAGE;

    if (neededItemCount > loadedItemCount) {
      const result = await onLoadPage(source.id, clampedPage + 1);

      if (!result.loaded) {
        return;
      }

      if (!result.receivedItemCount || result.totalItems <= loadedItemCount) {
        setKnownLastPage(currentPage + 1);
        return;
      }

      setKnownLastPage(null);
    }

    setCurrentPage(clampedPage);
  }

  return (
    <article
      className={`sourceCard category-${source.categoryKey} ${source.status === "error" ? "sourceCard-error" : ""}`}
      aria-busy={isRefreshing || isPageLoading}
      data-category-key={source.categoryKey}
      id={source.id}
    >
      <header className="sourceHead">
        <div className="sourceTitle">
          <span className={`logo logo-${source.tone}`}>{source.logo}</span>
          <div className="nameWrap">
            <h2 className="sourceName">{source.name}</h2>
            <div className="categoryName">{source.category}</div>
          </div>
        </div>
        <div className="sourceHeadRight">
          <div className={`sourceBadge ${source.status === "error" ? "sourceBadge-error" : ""}`}>
            {source.status === "error" ? "兜底" : "实时"}
          </div>
          <div className="boardName">{source.board}</div>
        </div>
      </header>

      <div className="sourceBody">
        {isRefreshing ? (
          <div className="sourceOverlay" role="status">
            <RefreshCcw className="spin" size={18} strokeWidth={2.2} />
            <span>刷新中</span>
          </div>
        ) : null}
        <ol className="itemList">
          {pageItems.map((item, index) => {
            const rank = pageStart + index + 1;

            return (
            <li
              className={`newsItem newsItem-${source.displayType}`}
              key={item.id}
            >
              <span className={`rank ${rank <= 3 ? `rank-${rank}` : ""}`}>
                {source.displayType === "timeline" ? item.metric : rank}
              </span>
              <a
                className="itemMain"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
                title={item.title}
              >
                <span className="itemTitle">{item.title}</span>
                <span className="itemSummary">{item.summary}</span>
              </a>
              <span className="itemSide">
                <span className="metric">{item.metric}</span>
              </span>
            </li>
            );
          })}
        </ol>
      </div>

      <footer className="sourceFoot">
        <span className="footLeft">
          {source.status === "error" ? "使用兜底数据 · 需要配置" : source.footer}
        </span>
        {canPage ? (
          <span
            className="pagerControls"
            aria-busy={isPageLoading}
            aria-label={`${source.name} 分页`}
          >
            <button
              aria-label="上一页"
              disabled={currentPage === 0 || isPageLoading}
              onClick={() => void goToPage(currentPage - 1)}
              type="button"
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <span aria-live="polite">
              {isPageLoading ? "加载中" : `${currentPage + 1}/${totalPages}`}
            </span>
            <button
              aria-label="下一页"
              disabled={currentPage >= totalPages - 1 || isPageLoading}
              onClick={() => void goToPage(currentPage + 1)}
              type="button"
            >
              <ChevronRight size={16} strokeWidth={2.4} />
            </button>
          </span>
        ) : null}
        <span className="footActions">
          <button
            aria-label={`${source.name} 刷新`}
            disabled={isRefreshing}
            onClick={() => void onRefresh(source.id)}
            type="button"
          >
            <RefreshCcw className={isRefreshing ? "spin" : ""} size={17} strokeWidth={2.2} />
          </button>
          <a
            aria-label={`${source.name} 打开主页`}
            href={source.homeUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink size={17} strokeWidth={2.2} />
          </a>
        </span>
      </footer>
    </article>
  );
}

function mergeSourcePage(
  source: BoardSource,
  items: BoardSource["items"],
  totalItems: number
): BoardSource {
  const byId = new Map(source.items.map((item) => [item.id, item]));

  for (const item of items) {
    byId.set(item.id, item);
  }

  return {
    ...source,
    diagnostic: {
      ...source.diagnostic,
      itemCount: Math.max(source.diagnostic.itemCount, totalItems, byId.size)
    },
    items: Array.from(byId.values())
  };
}

function SubscriptionSettingsPage({
  draggingSourceId,
  onAddCategorySubscriptions,
  onDragEnd,
  onDragStart,
  onDropInSubscribed,
  onReset,
  onToggleSubscription,
  preferences,
  sources
}: {
  draggingSourceId: string | null;
  onAddCategorySubscriptions: (sourceIds: string[]) => void;
  onDragEnd: () => void;
  onDragStart: (sourceId: string) => void;
  onDropInSubscribed: (activeSourceId: string, overSourceId?: string) => void;
  onReset: () => void;
  onToggleSubscription: (sourceId: string) => void;
  preferences: LocalPreferences;
  sources: BoardSource[];
}) {
  const sourcesByCategory = categories.map((category) => ({
    ...category,
    sources: sources
      .filter((source) => source.category === category.label)
      .sort(compareSourcesByRecommendation)
  }));
  const subscribedSources = sources.filter((source) =>
    preferences.subscribedSourceIds.includes(source.id)
  );

  function handleSubscribedDrop(activeSourceId: string, overSourceId?: string) {
    onDropInSubscribed(activeSourceId, overSourceId);
  }

  return (
    <section className="subscriptionSettings" id="subscription-settings" aria-label="订阅设置">
      <aside className="subscriptionPanel subscriptionPanel-sticky">
        <div className="subscriptionPanelHead">
          <div>
            <strong>我的订阅</strong>
            <span>{subscribedSources.length} 个来源 · 拖拽调整阅读顺序</span>
          </div>
          <button onClick={onReset} type="button">
            重置默认
          </button>
        </div>
        <div className="subscriptionHint">
          页面打开只拉取已订阅来源。想扩展信息面时，从右侧添加或拖入即可。
        </div>
        <div
          className="subscriptionList subscriptionList-sortable"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();

            const activeSourceId = event.dataTransfer.getData("text/plain");

            if (activeSourceId) {
              handleSubscribedDrop(activeSourceId);
            }
          }}
        >
          {subscribedSources.length ? (
            subscribedSources.map((source) => (
              <SubscriptionSourceRow
                draggable
                draggingSourceId={draggingSourceId}
                key={source.id}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
                onDropInSubscribed={handleSubscribedDrop}
                onToggleSubscription={onToggleSubscription}
                source={source}
              />
            ))
          ) : (
            <span className="mutedText">暂无订阅源，可从右侧拖入或直接添加。</span>
          )}
        </div>
      </aside>
      <section className="sourceCatalogPanel" aria-label="可订阅来源">
        <div className="sourceCatalogIntro">
          <div>
            <strong>可订阅来源</strong>
            <span>按标签分类浏览，预览原站后再决定是否加入。</span>
          </div>
        </div>
        <div className="subscriptionCategoryGrid">
          {sourcesByCategory.map((group) => {
            const subscribedCount = group.sources.filter((source) =>
              preferences.subscribedSourceIds.includes(source.id)
            ).length;

            return (
              <section
                className={`subscriptionCategoryBlock subscriptionCategoryBlock-${group.anchor}`}
                key={group.anchor}
              >
                <div className="subscriptionCategoryHead">
                  <div>
                    <strong>{group.label}</strong>
                    <span>{subscribedCount}/{group.sources.length} 已订阅</span>
                  </div>
                  <button
                    disabled={!group.sources.some((source) => !preferences.subscribedSourceIds.includes(source.id))}
                    onClick={() => onAddCategorySubscriptions(group.sources.map((source) => source.id))}
                    type="button"
                  >
                    全部添加
                  </button>
                </div>
                <div className="subscriptionSourceGrid">
                  {group.sources.length ? (
                    group.sources.map((source) => (
                      <SubscriptionSourceCard
                        draggable
                        draggingSourceId={draggingSourceId}
                        key={source.id}
                        onDragEnd={onDragEnd}
                        onDragStart={onDragStart}
                        onToggleSubscription={onToggleSubscription}
                        preferences={preferences}
                        source={source}
                      />
                    ))
                  ) : (
                    <span className="mutedText">暂无来源</span>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function SubscriptionSourceRow({
  draggable = false,
  draggingSourceId,
  onDragEnd,
  onDragStart,
  onDropInSubscribed,
  onToggleSubscription,
  source
}: {
  draggable?: boolean;
  draggingSourceId: string | null;
  onDragEnd: () => void;
  onDragStart: (sourceId: string) => void;
  onDropInSubscribed: (activeSourceId: string, overSourceId?: string) => void;
  onToggleSubscription: (sourceId: string) => void;
  source: BoardSource;
}) {
  const isDragging = draggingSourceId === source.id;

  return (
    <div
      className={`subscriptionRow ${isDragging ? "subscriptionRow-dragging" : ""}`}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        if (!draggable) {
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", source.id);
        onDragStart(source.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();

        const activeSourceId = event.dataTransfer.getData("text/plain");

        if (activeSourceId && activeSourceId !== source.id) {
          onDropInSubscribed(activeSourceId, source.id);
        }
      }}
    >
      <span className={`logo logo-${source.tone}`}>{source.logo}</span>
      <div className="subscriptionRowInfo">
        <strong>{source.name}</strong>
        <span>{source.category} · {source.board}</span>
      </div>
      {draggable ? (
        <span className="sourceDragHandle" title="拖拽排序">
          <GripVertical size={15} strokeWidth={2.4} />
        </span>
      ) : null}
      <button
        aria-label={`取消订阅 ${source.name}`}
        className="subscriptionIconButton"
        onClick={() => onToggleSubscription(source.id)}
        title="取消订阅"
        type="button"
      >
        <Minus size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function SubscriptionSourceCard({
  draggable = false,
  draggingSourceId,
  onDragEnd,
  onDragStart,
  onToggleSubscription,
  preferences,
  source
}: {
  draggable?: boolean;
  draggingSourceId: string | null;
  onDragEnd: () => void;
  onDragStart: (sourceId: string) => void;
  onToggleSubscription: (sourceId: string) => void;
  preferences: LocalPreferences;
  source: BoardSource;
}) {
  const isSubscribed = preferences.subscribedSourceIds.includes(source.id);
  const isDragging = draggingSourceId === source.id;
  const recommendationScore = getSourceRecommendationScore(source);

  return (
    <article
      className={`subscriptionSourceCard ${isSubscribed ? "subscriptionSourceCard-subscribed" : ""} ${isDragging ? "subscriptionSourceCard-dragging" : ""}`}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        if (!draggable) {
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", source.id);
        onDragStart(source.id);
      }}
    >
      <div className="subscriptionSourceMain">
        <span className={`logo logo-${source.tone}`}>{source.logo}</span>
        <div>
          <h3>{source.name}</h3>
          <p>{getSourceIntro(source)}</p>
        </div>
      </div>
      <div className="subscriptionSourceMeta">
        <span className={`sourceBadge ${source.status === "error" ? "sourceBadge-error" : ""}`}>
          {source.status === "error" ? "兜底" : "实时"}
        </span>
        <span className="recommendScore">
          <Star fill="currentColor" size={13} strokeWidth={2.2} />
          {recommendationScore}
        </span>
      </div>
      <div className="subscriptionSourceActions">
        <button
          aria-pressed={isSubscribed}
          className={isSubscribed ? "active" : ""}
          onClick={() => onToggleSubscription(source.id)}
          type="button"
        >
          {isSubscribed ? (
            <>
              <Minus size={15} strokeWidth={2.4} />
              已订阅
            </>
          ) : (
            <>
              <Plus size={15} strokeWidth={2.4} />
              订阅
            </>
          )}
        </button>
        <a href={source.homeUrl} rel="noopener noreferrer" target="_blank">
          <ExternalLink size={15} strokeWidth={2.4} />
          预览
        </a>
        <span className="sourceDragHandle" title="拖拽到左侧订阅清单">
          <GripVertical size={15} strokeWidth={2.4} />
        </span>
      </div>
    </article>
  );
}

function getSourceIntro(source: BoardSource) {
  const catalogSource = catalogSources.find((item) => item.id === source.id);
  const seedSummary = catalogSource?.items.find((item) => item.summary)?.summary;
  const liveSummary = source.items.find((item) => item.summary)?.summary;

  return liveSummary || seedSummary || source.footer || `${source.name} 的${source.board}内容源`;
}

function getSourceRecommendationScore(source: BoardSource) {
  const catalogSource = catalogSources.find((item) => item.id === source.id);
  let score = source.defaultSubscribed ? 94 : 82;

  if (source.status === "ok") {
    score += 4;
  }

  if (source.diagnostic.mode === "live") {
    score += 2;
  }

  if (catalogSource?.fetchCost === "high") {
    score -= 6;
  } else if (catalogSource?.fetchCost === "medium") {
    score -= 2;
  }

  return Math.max(68, Math.min(score, 99));
}

function compareSourcesByRecommendation(sourceA: BoardSource, sourceB: BoardSource) {
  const scoreDelta = getSourceRecommendationScore(sourceB) - getSourceRecommendationScore(sourceA);

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return sourceA.priority - sourceB.priority;
}

function getStatusStats(board: BoardPayload) {
  const error = board.sources.filter((source) => source.status === "error").length;

  return {
    error,
    ok: board.sources.length - error
  };
}

function getSubscribedBoard(board: BoardPayload, preferences: LocalPreferences): BoardPayload {
  const subscribedSourceIds = new Set(preferences.subscribedSourceIds);
  const sources = board.sources.filter((source) => subscribedSourceIds.has(source.id));

  return {
    ...board,
    itemCount: sources.reduce((count, source) => count + source.items.length, 0),
    sourceCount: sources.length,
    sources
  };
}

function filterSourcesByCategory(sources: BoardSource[], activeCategory: ActiveCategory) {
  if (activeCategory === "subscriptions" || activeCategory === "all") {
    return sources;
  }

  return sources.filter((source) => source.categoryKey === activeCategory);
}

function getActiveScopeLabel(activeCategory: ActiveCategory, viewMode: ViewMode) {
  if (activeCategory !== "subscriptions" && activeCategory !== "all") {
    return categories.find((category) => category.anchor === activeCategory)?.label ?? "分类";
  }

  const labels: Record<ViewMode, string> = {
    all: "全部来源",
    "subscription-settings": "订阅设置",
    subscriptions: "我的订阅"
  };

  return labels[viewMode];
}

function getCatalogSourceIdsForScope(activeCategory: ActiveCategory, viewMode: ViewMode) {
  if (activeCategory === "subscriptions" || viewMode === "subscription-settings") {
    return [];
  }

  if (activeCategory === "all") {
    return catalogSources.map((source) => source.id);
  }

  const categoryLabel = categories.find((category) => category.anchor === activeCategory)?.label;

  if (!categoryLabel) {
    return [];
  }

  return catalogSources
    .filter((source) => source.category === categoryLabel)
    .map((source) => source.id);
}

function scrollToTop() {
  document.getElementById("top")?.scrollIntoView({ block: "start" });
}

function applyPreferences(
  sources: BoardSource[],
  preferences: LocalPreferences,
  viewMode: ViewMode
) {
  const orderedSources = orderSources(sources, preferences.sourceOrder);

  if (viewMode !== "subscriptions") {
    return orderedSources;
  }

  return orderedSources.filter((source) => preferences.subscribedSourceIds.includes(source.id));
}

function loadLocalPreferences(sources: BoardSource[]): LocalPreferences {
  if (typeof window === "undefined") {
    return normalizePreferences(defaultPreferences, sources);
  }

  try {
    const storedPreferences =
      window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_PREFERENCES_STORAGE_KEY);

    if (!storedPreferences) {
      return normalizePreferences(defaultPreferences, sources);
    }

    const parsed = JSON.parse(storedPreferences) as Partial<LocalPreferences>;

    return normalizePreferences({
      favoriteItemIds: Array.isArray(parsed.favoriteItemIds) ? parsed.favoriteItemIds : [],
      hiddenItemIds: Array.isArray(parsed.hiddenItemIds) ? parsed.hiddenItemIds : [],
      includeKeywords: Array.isArray(parsed.includeKeywords)
        ? parsed.includeKeywords
        : defaultPreferences.includeKeywords,
      excludeKeywords: Array.isArray(parsed.excludeKeywords) ? parsed.excludeKeywords : [],
      showHidden: Boolean(parsed.showHidden),
      subscribedSourceIds: Array.isArray(parsed.subscribedSourceIds) ? parsed.subscribedSourceIds : [],
      hiddenSourceIds: Array.isArray(parsed.hiddenSourceIds) ? parsed.hiddenSourceIds : [],
      sourceOrder: Array.isArray(parsed.sourceOrder) ? parsed.sourceOrder : [],
      defaultView: parsed.defaultView === "all" ? "all" : "subscriptions",
      collapsedSourceIds: Array.isArray(parsed.collapsedSourceIds) ? parsed.collapsedSourceIds : []
    }, sources);
  } catch {
    return normalizePreferences(defaultPreferences, sources);
  }
}

function normalizePreferences(preferences: Partial<LocalPreferences>, sources: BoardSource[]): LocalPreferences {
  const defaultSourceIds = getDefaultSourceIds(sources);
  const defaultSubscribedSourceIds = getDefaultSubscribedSourceIds(sources);
  const sourceOrder = mergeSourceOrder(
    [...(preferences.sourceOrder ?? []), ...(preferences.subscribedSourceIds ?? [])],
    defaultSourceIds
  );
  const hasExplicitSubscriptionState =
    Array.isArray(preferences.subscribedSourceIds) &&
    (preferences.subscribedSourceIds.length > 0 || Boolean(preferences.sourceOrder?.length));
  const subscribedSourceIds = (hasExplicitSubscriptionState
    ? uniqueStrings(preferences.subscribedSourceIds ?? [])
    : defaultSubscribedSourceIds
  );

  return {
    favoriteItemIds: uniqueStrings(preferences.favoriteItemIds ?? []),
    hiddenItemIds: uniqueStrings(preferences.hiddenItemIds ?? []),
    includeKeywords: uniqueStrings(preferences.includeKeywords?.length
      ? preferences.includeKeywords
      : defaultPreferences.includeKeywords),
    excludeKeywords: uniqueStrings(preferences.excludeKeywords ?? []),
    showHidden: Boolean(preferences.showHidden),
    subscribedSourceIds: sourceOrder.filter((sourceId) => subscribedSourceIds.includes(sourceId)),
    hiddenSourceIds: sourceOrder.filter((sourceId) => preferences.hiddenSourceIds?.includes(sourceId)),
    sourceOrder,
    defaultView: preferences.defaultView === "all" ? "all" : "subscriptions",
    collapsedSourceIds: sourceOrder.filter((sourceId) => preferences.collapsedSourceIds?.includes(sourceId))
  };
}

function getPreferenceCounts(preferences: LocalPreferences) {
  return {
    subscribed: preferences.subscribedSourceIds.length
  };
}

function getDefaultSourceIds(sources: BoardSource[]) {
  return sources
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((source) => source.id);
}

function getDefaultSubscribedSourceIds(sources: BoardSource[]) {
  const sortedSources = sources.slice().sort((a, b) => a.priority - b.priority);
  const explicitlySubscribedSources = sortedSources.filter((source) => source.defaultSubscribed);

  return (explicitlySubscribedSources.length ? explicitlySubscribedSources : sortedSources).map(
    (source) => source.id
  );
}

function orderSources(sources: BoardSource[], sourceOrder: string[]) {
  const order = mergeSourceOrder(sourceOrder, getDefaultSourceIds(sources));
  const orderIndex = new Map(order.map((sourceId, index) => [sourceId, index]));

  return sources
    .slice()
    .sort((a, b) => (orderIndex.get(a.id) ?? a.priority) - (orderIndex.get(b.id) ?? b.priority));
}

function mergeSourceOrder(order: string[], defaultSourceIds: string[]) {
  const cleanOrder = uniqueStrings(order);

  return [
    ...cleanOrder,
    ...defaultSourceIds.filter((sourceId) => !cleanOrder.includes(sourceId))
  ];
}

function moveBefore(order: string[], activeSourceId: string, overSourceId: string) {
  const nextOrder = order.filter((sourceId) => sourceId !== activeSourceId);
  const overIndex = nextOrder.indexOf(overSourceId);

  if (overIndex < 0) {
    return [...nextOrder, activeSourceId];
  }

  nextOrder.splice(overIndex, 0, activeSourceId);
  return nextOrder;
}

function moveAfterLastSubscribed(
  order: string[],
  activeSourceId: string,
  subscribedSourceIds: Set<string>
) {
  const nextOrder = order.filter((sourceId) => sourceId !== activeSourceId);
  let lastSubscribedIndex = -1;

  nextOrder.forEach((sourceId, index) => {
    if (subscribedSourceIds.has(sourceId)) {
      lastSubscribedIndex = index;
    }
  });

  nextOrder.splice(lastSubscribedIndex + 1, 0, activeSourceId);
  return nextOrder;
}

function moveAfterCategorySubscriptions(
  order: string[],
  activeSourceId: string,
  subscribedSourceIds: Set<string>,
  sourceById: Map<string, BoardSource>
) {
  const activeSource = sourceById.get(activeSourceId);

  if (!activeSource) {
    return moveAfterLastSubscribed(order, activeSourceId, subscribedSourceIds);
  }

  const nextOrder = order.filter((sourceId) => sourceId !== activeSourceId);
  let insertIndex = -1;

  nextOrder.forEach((sourceId, index) => {
    const source = sourceById.get(sourceId);

    if (source?.categoryKey === activeSource.categoryKey && subscribedSourceIds.has(sourceId)) {
      insertIndex = index;
    }
  });

  if (insertIndex < 0) {
    nextOrder.forEach((sourceId, index) => {
      const source = sourceById.get(sourceId);

      if (source?.categoryKey === activeSource.categoryKey) {
        insertIndex = index;
      }
    });
  }

  nextOrder.splice(insertIndex + 1, 0, activeSourceId);
  return nextOrder;
}

function getSourceById(sources: BoardSource[]) {
  return new Map(sources.map((source) => [source.id, source]));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function buildTrendInsights(sources: BoardSource[]) {
  return TREND_TOPICS
    .map((topic) => {
      const matchedItems = sources.flatMap((source) =>
        source.items
          .filter((item) => topic.pattern.test(`${item.title} ${item.summary}`))
          .map((item) => item.sourceId)
      );

      return {
        count: matchedItems.length,
        label: topic.label,
        sourceCount: new Set(matchedItems).size
      };
    })
    .filter((topic) => topic.count > 0)
    .sort((a, b) => b.count - a.count || b.sourceCount - a.sourceCount)
    .slice(0, 6);
}

function buildEventClusters(sources: BoardSource[]) {
  return TREND_TOPICS
    .map((topic) => {
      const items = sources.flatMap((source) =>
        source.items
          .filter((item) => topic.pattern.test(`${item.title} ${item.summary}`))
          .map((item) => ({
            ...item,
            sourceName: source.name
          }))
      );

      return {
        items,
        label: topic.label,
        leadTitles: items.slice(0, 3).map((item) => item.title),
        sourceCount: new Set(items.map((item) => item.sourceId)).size
      };
    })
    .filter((cluster) => cluster.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length || b.sourceCount - a.sourceCount)
    .slice(0, 4);
}

function buildTrendSnapshot(sources: BoardSource[]): TrendSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    topicItemIds: Object.fromEntries(
      TREND_TOPICS.map((topic) => [
        topic.label,
        sources.flatMap((source) =>
          source.items
            .filter((item) => topic.pattern.test(`${item.title} ${item.summary}`))
            .map((item) => item.id)
        )
      ])
    )
  };
}

function loadTrendSnapshot(): TrendSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedSnapshot = window.localStorage.getItem(TREND_SNAPSHOT_STORAGE_KEY);
    return storedSnapshot ? JSON.parse(storedSnapshot) as TrendSnapshot : null;
  } catch {
    return null;
  }
}

function buildTrendChanges(
  snapshot: TrendSnapshot,
  previousSnapshot: TrendSnapshot | null,
  sources: BoardSource[]
): TrendChange[] {
  const sourceIdsByTopic = new Map(
    TREND_TOPICS.map((topic) => [
      topic.label,
      new Set(
        sources.flatMap((source) =>
          source.items
            .filter((item) => topic.pattern.test(`${item.title} ${item.summary}`))
            .map(() => source.id)
        )
      )
    ])
  );

  return Object.entries(snapshot.topicItemIds)
    .map(([label, itemIds]) => {
      const previousIds = new Set(previousSnapshot?.topicItemIds[label] ?? []);
      const newCount = itemIds.filter((itemId) => !previousIds.has(itemId)).length;

      return {
        count: itemIds.length,
        label,
        newCount,
        previousCount: previousIds.size,
        sourceCount: sourceIdsByTopic.get(label)?.size ?? 0
      };
    })
    .filter((trend) => trend.count > 0)
    .sort((a, b) => b.newCount - a.newCount || b.count - a.count)
    .slice(0, 6);
}

function buildDiagnostics(board: BoardPayload) {
  const ok = board.sources.filter((source) => source.status !== "error").length;
  const fallback = board.sources.length - ok;
  const seed = board.sources.filter((source) => source.diagnostic.mode === "seed").length;

  return {
    fallback,
    itemCount: board.itemCount,
    ok,
    seed,
    updatedAt: new Date(board.generatedAt).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Shanghai"
    })
  };
}

function formatDiagnosticMode(mode: BoardSource["diagnostic"]["mode"]) {
  if (mode === "live") {
    return "实时";
  }

  if (mode === "fallback") {
    return "兜底";
  }

  return "种子";
}

function formatDiagnosticTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}
