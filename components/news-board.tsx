"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ExternalLink,
  GripVertical,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Star,
  X
} from "lucide-react";
import { type BoardPayload, type BoardSource } from "@/lib/board-service";
import { categories } from "@/lib/news-data";

type NewsBoardProps = {
  initialBoard: BoardPayload;
};

const CARD_ITEMS_PER_PAGE = 8;
const PREFERENCES_STORAGE_KEY = "anyknews.preferences.v2";
const LEGACY_PREFERENCES_STORAGE_KEY = "anyknews.preferences.v1";
const TREND_SNAPSHOT_STORAGE_KEY = "anyknews.trend-snapshot.v1";

type ViewMode = "subscriptions" | "all" | "favorites" | "focus";
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null);
  const [loadingPageSourceId, setLoadingPageSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("subscriptions");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSourceManagerOpen, setIsSourceManagerOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [preferences, setPreferences] = useState<LocalPreferences>(() =>
    loadLocalPreferences(initialBoard.sources)
  );
  const [draggingSourceId, setDraggingSourceId] = useState<string | null>(null);
  const [trendChanges, setTrendChanges] = useState<TrendChange[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const statusStats = getStatusStats(board);
  const normalizedPreferences = useMemo(
    () => normalizePreferences(preferences, board.sources),
    [board.sources, preferences]
  );
  const personalizedSources = useMemo(
    () => applyPreferences(board.sources, normalizedPreferences, viewMode),
    [board.sources, normalizedPreferences, viewMode]
  );
  const categoryFilteredSources = useMemo(
    () => filterSourcesByCategory(personalizedSources, activeCategory),
    [activeCategory, personalizedSources]
  );
  const filteredSources = useMemo(
    () => filterBoardSources(categoryFilteredSources, searchQuery),
    [categoryFilteredSources, searchQuery]
  );
  const visibleItemCount = filteredSources.reduce(
    (count, source) => count + source.items.length,
    0
  );
  const preferenceCounts = useMemo(() => getPreferenceCounts(normalizedPreferences), [normalizedPreferences]);
  const trendInsights = useMemo(
    () => buildTrendInsights(applyPreferences(board.sources, normalizedPreferences, "all")),
    [board.sources, normalizedPreferences]
  );
  const eventClusters = useMemo(
    () => buildEventClusters(applyPreferences(board.sources, normalizedPreferences, "all")),
    [board.sources, normalizedPreferences]
  );
  const diagnostics = useMemo(() => buildDiagnostics(board), [board]);
  const isSearching = searchQuery.trim().length > 0;
  const activeScopeLabel = getActiveScopeLabel(activeCategory, viewMode);
  const managedSources = useMemo(
    () => orderSources(board.sources, normalizedPreferences.sourceOrder),
    [board.sources, normalizedPreferences.sourceOrder]
  );

  useEffect(() => {
    const nextPreferences = normalizePreferences(preferences, board.sources);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences));

    if (JSON.stringify(nextPreferences) !== JSON.stringify(preferences)) {
      setPreferences(nextPreferences);
    }
  }, [board.sources, preferences]);

  useEffect(() => {
    const snapshot = buildTrendSnapshot(board.sources);
    const previousSnapshot = loadTrendSnapshot();

    setTrendChanges(buildTrendChanges(snapshot, previousSnapshot, board.sources));
    window.localStorage.setItem(TREND_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  }, [board.sources]);

  const loadBoard = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    setRefreshSummary(null);

    try {
      const response = await fetch(`/api/boards?refresh=${force ? "force" : "stale"}`, {
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
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }

      if (event.key === "Escape") {
        setSearchQuery("");
        setIsSearchOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

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

  async function loadSourcePage(sourceId: string, page: number) {
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

      return true;
    } catch {
      setError("加载更多内容失败，正在显示已缓存内容");
      return false;
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

  function togglePreferenceList(listKey: "favoriteItemIds" | "hiddenItemIds", itemId: string) {
    setPreferences((current) => {
      const currentSet = new Set(current[listKey]);

      if (currentSet.has(itemId)) {
        currentSet.delete(itemId);
      } else {
        currentSet.add(itemId);
      }

      return {
        ...current,
        [listKey]: Array.from(currentSet)
      };
    });
  }

  function addKeyword(kind: "includeKeywords" | "excludeKeywords") {
    const normalizedKeyword = normalizeKeyword(keywordDraft);

    if (!normalizedKeyword) {
      return;
    }

    setPreferences((current) => ({
      ...current,
      [kind]: Array.from(new Set([...current[kind], normalizedKeyword]))
    }));
    setKeywordDraft("");
  }

  function removeKeyword(kind: "includeKeywords" | "excludeKeywords", keyword: string) {
    setPreferences((current) => ({
      ...current,
      [kind]: current[kind].filter((item) => item !== keyword)
    }));
  }

  function toggleSourceSubscription(sourceId: string) {
    setPreferences((current) => {
      const normalized = normalizePreferences(current, board.sources);
      const sourceSet = new Set(normalized.subscribedSourceIds);

      if (sourceSet.has(sourceId)) {
        sourceSet.delete(sourceId);
      } else {
        sourceSet.add(sourceId);
      }

      return {
        ...normalized,
        subscribedSourceIds: normalized.sourceOrder.filter((id) => sourceSet.has(id))
      };
    });
  }

  function toggleSourceHidden(sourceId: string) {
    setPreferences((current) => {
      const normalized = normalizePreferences(current, board.sources);
      const hiddenSet = new Set(normalized.hiddenSourceIds);

      if (hiddenSet.has(sourceId)) {
        hiddenSet.delete(sourceId);
      } else {
        hiddenSet.add(sourceId);
      }

      return {
        ...normalized,
        hiddenSourceIds: normalized.sourceOrder.filter((id) => hiddenSet.has(id))
      };
    });
  }

  function reorderSources(activeSourceId: string, overSourceId: string) {
    if (activeSourceId === overSourceId) {
      return;
    }

    setPreferences((current) => {
      const normalized = normalizePreferences(current, board.sources);
      const nextOrder = moveBefore(normalized.sourceOrder, activeSourceId, overSourceId);

      return {
        ...normalized,
        sourceOrder: nextOrder,
        subscribedSourceIds: nextOrder.filter((id) => normalized.subscribedSourceIds.includes(id))
      };
    });
  }

  function resetSourcePreferences() {
    setPreferences((current) => ({
      ...normalizePreferences(current, board.sources),
      hiddenSourceIds: [],
      sourceOrder: getDefaultSourceIds(board.sources),
      subscribedSourceIds: getDefaultSourceIds(board.sources)
    }));
  }

  async function refreshVisibleSources() {
    setIsLoading(true);
    setError(null);
    setRefreshSummary(null);

    try {
      for (const source of filteredSources) {
        await refreshSource(source.id);
      }

      setRefreshSummary(`已刷新当前可见的 ${filteredSources.length} 个来源`);
    } catch {
      setError("可见来源刷新失败，已保留当前列表");
    } finally {
      setIsLoading(false);
    }
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
              setViewMode("subscriptions");
              setActiveCategory("subscriptions");
              scrollToTop();
            }}
          >
            我的订阅
          </a>
          {categories.map((category) => (
            <a
              aria-current={viewMode !== "subscriptions" && activeCategory === category.anchor ? "page" : undefined}
              className={viewMode !== "subscriptions" && activeCategory === category.anchor ? "navActive" : undefined}
              href={`#${category.anchor}`}
              key={category.anchor}
              onClick={(event) => {
                event.preventDefault();
                setViewMode("all");
                setActiveCategory(category.anchor as ActiveCategory);
                scrollToTop();
              }}
            >
              {category.label}
            </a>
          ))}
        </nav>
        <div className="actions">
          {isSearchOpen ? (
            <label className="searchBox">
              <Search size={16} strokeWidth={2.3} />
              <input
                aria-label="搜索标题、摘要或来源"
                id="news-search"
                name="q"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索标题、摘要、来源"
                ref={searchInputRef}
                type="search"
                value={searchQuery}
              />
              <button
                aria-label="关闭搜索"
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                type="button"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </label>
          ) : null}
          <span className={`statusPill ${statusStats.error ? "statusPill-warn" : ""}`}>
            <span className="statusDot" />
            {statusStats.ok}/{board.sourceCount} 可用
          </span>
          <button
            className="iconButton"
            aria-label="搜索"
            onClick={() => setIsSearchOpen((current) => !current)}
            type="button"
          >
            <Search size={18} strokeWidth={2.4} />
          </button>
          <button
            className="iconButton"
            aria-label="刷新当前可见来源"
            disabled={isLoading}
            onClick={() => void refreshVisibleSources()}
            title="刷新当前可见来源"
            type="button"
          >
            <RefreshCcw className={isLoading ? "spin" : ""} size={18} strokeWidth={2.4} />
          </button>
          <button
            className="iconButton"
            aria-label="管理信息源"
            onClick={() => setIsSourceManagerOpen((current) => !current)}
            title="管理信息源"
            type="button"
          >
            <SlidersHorizontal size={18} strokeWidth={2.4} />
          </button>
        </div>
      </header>

      <main className="main" id="top">
        <div className="boardMeta">
          <div>
            <strong>今日热榜</strong>
            <span>
              {isSearching
                ? `${filteredSources.length} 个来源 · ${visibleItemCount} 条匹配 · ${statusStats.error} 个兜底`
                : `${filteredSources.length} 个来源 · ${visibleItemCount} 条 · ${statusStats.error} 个兜底`}
            </span>
          </div>
          <div>{activeScopeLabel} · 打开时更新 · AI日报 10:00</div>
        </div>
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
                  {board.sources.map((source) => (
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
        {isSearching ? (
          <div className="inlineNotice" role="status" aria-live="polite">
            正在筛选：{searchQuery.trim()}
          </div>
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
        <section className="controlSurface" aria-label="个性化控制">
          <div className="viewModes" role="group" aria-label="看板筛选">
            {[
              ["subscriptions", `我的订阅 ${preferenceCounts.subscribed}`],
              ["all", "全部来源"],
              ["favorites", `收藏 ${preferenceCounts.favorite}`],
              ["focus", `关注词 ${preferences.includeKeywords.length}`]
            ].map(([mode, label]) => (
              <button
                aria-pressed={viewMode === mode}
                className={viewMode === mode ? "active" : ""}
                key={mode}
                onClick={() => {
                  const nextMode = mode as ViewMode;

                  setViewMode(nextMode);
                  setActiveCategory(nextMode === "subscriptions" ? "subscriptions" : "all");
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="controlActions">
            <button
              aria-pressed={preferences.showHidden}
              className={preferences.showHidden ? "active" : ""}
              onClick={() =>
                setPreferences((current) => ({
                  ...current,
                  showHidden: !current.showHidden
                }))
              }
              type="button"
            >
              <EyeOff size={15} strokeWidth={2.2} />
              忽略 {preferenceCounts.hidden}
            </button>
            <button
              aria-expanded={isSourceManagerOpen}
              className={isSourceManagerOpen ? "active" : ""}
              onClick={() => setIsSourceManagerOpen((current) => !current)}
              type="button"
            >
              <SlidersHorizontal size={15} strokeWidth={2.2} />
              信息源
            </button>
            <button
              aria-expanded={isSettingsOpen}
              className={isSettingsOpen ? "active" : ""}
              onClick={() => setIsSettingsOpen((current) => !current)}
              type="button"
            >
              <SlidersHorizontal size={15} strokeWidth={2.2} />
              关键词
            </button>
          </div>
        </section>
        {isSourceManagerOpen ? (
          <SourceManager
            draggingSourceId={draggingSourceId}
            onDragEnd={() => setDraggingSourceId(null)}
            onDragStart={setDraggingSourceId}
            onReorder={reorderSources}
            onReset={resetSourcePreferences}
            onToggleHidden={toggleSourceHidden}
            onToggleSubscription={toggleSourceSubscription}
            preferences={normalizedPreferences}
            sources={managedSources}
          />
        ) : null}
        {isSettingsOpen ? (
          <section className="settingsPanel" aria-label="关键词规则">
            <div className="keywordComposer">
              <input
                aria-label="新增关键词"
                onChange={(event) => setKeywordDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    addKeyword("includeKeywords");
                  }
                }}
                placeholder="输入关键词，例如 AI agent、机器人、项目管理"
                type="text"
                value={keywordDraft}
              />
              <button onClick={() => addKeyword("includeKeywords")} type="button">
                加入关注
              </button>
              <button onClick={() => addKeyword("excludeKeywords")} type="button">
                加入屏蔽
              </button>
            </div>
            <KeywordChips
              emptyText="暂无关注关键词"
              keywords={preferences.includeKeywords}
              label="关注"
              onRemove={(keyword) => removeKeyword("includeKeywords", keyword)}
              tone="focus"
            />
            <KeywordChips
              emptyText="暂无屏蔽关键词"
              keywords={preferences.excludeKeywords}
              label="屏蔽"
              onRemove={(keyword) => removeKeyword("excludeKeywords", keyword)}
              tone="block"
            />
          </section>
        ) : null}
        {filteredSources.length ? (
          <section className="boardGrid" aria-label="信息源卡片">
            {filteredSources.map((source) => (
              <SourceCard
                isPageLoading={loadingPageSourceId === source.id}
                isRefreshing={refreshingSourceId === source.id}
                key={source.id}
                onLoadPage={loadSourcePage}
                onRefresh={refreshSource}
                onToggleSourceSubscription={toggleSourceSubscription}
                onToggleFavorite={(itemId) => togglePreferenceList("favoriteItemIds", itemId)}
                onToggleHidden={(itemId) => togglePreferenceList("hiddenItemIds", itemId)}
                preferences={normalizedPreferences}
                source={source}
              />
            ))}
          </section>
        ) : (
          <section className="emptyState" role="status" aria-live="polite">
            <Search size={22} strokeWidth={2.1} />
            <strong>没有匹配的信息</strong>
            <span>换个关键词，或清空搜索继续看全部来源。</span>
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
  onToggleSourceSubscription,
  onToggleFavorite,
  onToggleHidden,
  preferences,
  source
}: {
  isPageLoading: boolean;
  isRefreshing: boolean;
  onLoadPage: (sourceId: string, page: number) => Promise<boolean>;
  onRefresh: (sourceId: string) => Promise<void>;
  onToggleSourceSubscription: (sourceId: string) => void;
  onToggleFavorite: (itemId: string) => void;
  onToggleHidden: (itemId: string) => void;
  preferences: LocalPreferences;
  source: BoardSource;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const totalItems = Math.max(source.items.length, source.diagnostic.itemCount);
  const totalPages = Math.max(1, Math.ceil(totalItems / CARD_ITEMS_PER_PAGE));
  const pageStart = currentPage * CARD_ITEMS_PER_PAGE;
  const pageItems = source.items.slice(pageStart, pageStart + CARD_ITEMS_PER_PAGE);
  const canPage = totalItems > CARD_ITEMS_PER_PAGE;
  const isSourceSubscribed = preferences.subscribedSourceIds.includes(source.id);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages - 1));
  }, [source.id, totalPages]);

  async function goToPage(nextPage: number) {
    const clampedPage = Math.max(0, Math.min(totalPages - 1, nextPage));
    const loadedItemCount = source.items.length;
    const neededItemCount = (clampedPage + 1) * CARD_ITEMS_PER_PAGE;

    if (neededItemCount > loadedItemCount) {
      const loaded = await onLoadPage(source.id, clampedPage + 1);

      if (!loaded) {
        return;
      }
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
          <button
            aria-label={isSourceSubscribed ? `取消订阅 ${source.name}` : `订阅 ${source.name}`}
            aria-pressed={isSourceSubscribed}
            className="sourceSubscribeButton"
            onClick={() => onToggleSourceSubscription(source.id)}
            title={isSourceSubscribed ? "取消订阅" : "订阅"}
            type="button"
          >
            <Star fill={isSourceSubscribed ? "currentColor" : "none"} size={16} strokeWidth={2.2} />
          </button>
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
            const isFavorite = preferences.favoriteItemIds.includes(item.id);
            const isHidden = preferences.hiddenItemIds.includes(item.id);
            const isFocus = matchesAnyKeyword(item, preferences.includeKeywords);

            return (
            <li
              className={`newsItem newsItem-${source.displayType} ${isFavorite ? "newsItem-favorite" : ""} ${isHidden ? "newsItem-hidden" : ""} ${isFocus ? "newsItem-focus" : ""}`}
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
                <span className="itemActions">
                  <button
                    aria-pressed={isFavorite}
                    aria-label={isFavorite ? "取消收藏" : "收藏"}
                    onClick={() => onToggleFavorite(item.id)}
                    title={isFavorite ? "取消收藏" : "收藏"}
                    type="button"
                  >
                    <Star fill={isFavorite ? "currentColor" : "none"} size={14} strokeWidth={2.2} />
                  </button>
                  <button
                    aria-pressed={isHidden}
                    aria-label={isHidden ? "取消忽略" : "忽略"}
                    onClick={() => onToggleHidden(item.id)}
                    title={isHidden ? "取消忽略" : "忽略"}
                    type="button"
                  >
                    <EyeOff size={14} strokeWidth={2.2} />
                  </button>
                </span>
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
          <span className="pagerControls" aria-label={`${source.name} 分页`}>
            <button
              aria-label="上一页"
              disabled={currentPage === 0 || isPageLoading}
              onClick={() => void goToPage(currentPage - 1)}
              type="button"
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <span>
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

function KeywordChips({
  emptyText,
  keywords,
  label,
  onRemove,
  tone
}: {
  emptyText: string;
  keywords: string[];
  label: string;
  onRemove: (keyword: string) => void;
  tone: "block" | "focus";
}) {
  return (
    <div className="keywordRow">
      <span>{label}</span>
      <div className="keywordChips">
        {keywords.length ? (
          keywords.map((keyword) => (
            <button
              className={`keywordChip keywordChip-${tone}`}
              key={keyword}
              onClick={() => onRemove(keyword)}
              type="button"
            >
              {keyword}
              <X size={12} strokeWidth={2.4} />
            </button>
          ))
        ) : (
          <span className="mutedText">{emptyText}</span>
        )}
      </div>
    </div>
  );
}

function SourceManager({
  draggingSourceId,
  onDragEnd,
  onDragStart,
  onReorder,
  onReset,
  onToggleHidden,
  onToggleSubscription,
  preferences,
  sources
}: {
  draggingSourceId: string | null;
  onDragEnd: () => void;
  onDragStart: (sourceId: string) => void;
  onReorder: (activeSourceId: string, overSourceId: string) => void;
  onReset: () => void;
  onToggleHidden: (sourceId: string) => void;
  onToggleSubscription: (sourceId: string) => void;
  preferences: LocalPreferences;
  sources: BoardSource[];
}) {
  const sourcesByCategory = categories.map((category) => ({
    ...category,
    sources: sources.filter((source) => source.category === category.label)
  }));
  const subscribedSources = sources.filter((source) =>
    preferences.subscribedSourceIds.includes(source.id)
  );

  return (
    <section className="sourceManager" aria-label="信息源管理">
      <div className="sourceManagerHead">
        <div>
          <strong>信息源</strong>
          <span>{preferences.subscribedSourceIds.length} 个订阅 · 拖拽调整顺序</span>
        </div>
        <button onClick={onReset} type="button">
          重置
        </button>
      </div>
      <div className="sourceManagerColumns">
        <div className="sourceManagerBlock">
          <div className="sourceManagerTitle">我的订阅</div>
          <div className="sourceManagerList sourceManagerList-sortable">
            {subscribedSources.length ? (
              subscribedSources.map((source) => (
                <SourceManagerRow
                  draggable
                  draggingSourceId={draggingSourceId}
                  key={source.id}
                  onDragEnd={onDragEnd}
                  onDragStart={onDragStart}
                  onReorder={onReorder}
                  onToggleHidden={onToggleHidden}
                  onToggleSubscription={onToggleSubscription}
                  preferences={preferences}
                  source={source}
                />
              ))
            ) : (
              <span className="mutedText">暂无订阅源，可从右侧重新订阅。</span>
            )}
          </div>
        </div>
        <div className="sourceManagerBlock sourceManagerBlock-wide">
          <div className="sourceManagerTitle">全部来源</div>
          <div className="sourceCategoryGrid">
            {sourcesByCategory.map((group) => (
              <div className="sourceCategoryBlock" key={group.anchor}>
                <strong>{group.label}</strong>
                <div className="sourceManagerList">
                  {group.sources.map((source) => (
                    <SourceManagerRow
                      draggingSourceId={draggingSourceId}
                      key={source.id}
                      onDragEnd={onDragEnd}
                      onDragStart={onDragStart}
                      onReorder={onReorder}
                      onToggleHidden={onToggleHidden}
                      onToggleSubscription={onToggleSubscription}
                      preferences={preferences}
                      source={source}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceManagerRow({
  draggable = false,
  draggingSourceId,
  onDragEnd,
  onDragStart,
  onReorder,
  onToggleHidden,
  onToggleSubscription,
  preferences,
  source
}: {
  draggable?: boolean;
  draggingSourceId: string | null;
  onDragEnd: () => void;
  onDragStart: (sourceId: string) => void;
  onReorder: (activeSourceId: string, overSourceId: string) => void;
  onToggleHidden: (sourceId: string) => void;
  onToggleSubscription: (sourceId: string) => void;
  preferences: LocalPreferences;
  source: BoardSource;
}) {
  const isSubscribed = preferences.subscribedSourceIds.includes(source.id);
  const isHidden = preferences.hiddenSourceIds.includes(source.id);
  const isDragging = draggingSourceId === source.id;

  return (
    <div
      className={`sourceManagerRow ${isHidden ? "sourceManagerRow-hidden" : ""} ${isDragging ? "sourceManagerRow-dragging" : ""}`}
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
        const activeSourceId = event.dataTransfer.getData("text/plain");

        if (activeSourceId) {
          onReorder(activeSourceId, source.id);
        }
      }}
    >
      <span className={`logo logo-${source.tone}`}>{source.logo}</span>
      <div className="sourceManagerInfo">
        <strong>{source.name}</strong>
        <span>{source.board}</span>
      </div>
      {draggable ? (
        <span className="sourceDragHandle" title="拖拽排序">
          <GripVertical size={15} strokeWidth={2.4} />
        </span>
      ) : null}
      <button
        aria-label={isSubscribed ? `取消订阅 ${source.name}` : `订阅 ${source.name}`}
        aria-pressed={isSubscribed}
        className={isSubscribed ? "active" : ""}
        onClick={() => onToggleSubscription(source.id)}
        title={isSubscribed ? "取消订阅" : "订阅"}
        type="button"
      >
        <Star fill={isSubscribed ? "currentColor" : "none"} size={14} strokeWidth={2.2} />
      </button>
      <button
        aria-label={isHidden ? `显示 ${source.name}` : `隐藏 ${source.name}`}
        aria-pressed={isHidden}
        className={isHidden ? "active" : ""}
        onClick={() => onToggleHidden(source.id)}
        title={isHidden ? "显示来源" : "隐藏来源"}
        type="button"
      >
        <EyeOff size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function getStatusStats(board: BoardPayload) {
  const error = board.sources.filter((source) => source.status === "error").length;

  return {
    error,
    ok: board.sources.length - error
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
    favorites: "收藏",
    focus: "关注词",
    subscriptions: "我的订阅"
  };

  return labels[viewMode];
}

function scrollToTop() {
  document.getElementById("top")?.scrollIntoView({ block: "start" });
}

function filterBoardSources(sources: BoardSource[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return sources;
  }

  return sources
    .map((source) => {
      const sourceMatches = containsQuery(
        [source.name, source.board, source.category],
        normalizedQuery
      );
      const items = sourceMatches
        ? source.items
        : source.items.filter((item) =>
            containsQuery([item.title, item.summary, item.metric], normalizedQuery)
          );

      return withFilteredItems(source, items);
    })
    .filter((source) => source.items.length > 0);
}

function containsQuery(values: string[], query: string) {
  return values.some((value) => value.toLowerCase().includes(query));
}

function applyPreferences(
  sources: BoardSource[],
  preferences: LocalPreferences,
  viewMode: ViewMode
) {
  const orderedSources = orderSources(sources, preferences.sourceOrder);

  return orderedSources
    .filter((source) => {
      if (preferences.hiddenSourceIds.includes(source.id)) {
        return false;
      }

      if (viewMode === "subscriptions") {
        return preferences.subscribedSourceIds.includes(source.id);
      }

      return true;
    })
    .map((source) => {
      const isDerivedItemView =
        viewMode === "favorites" ||
        viewMode === "focus" ||
        !preferences.showHidden ||
        preferences.hiddenItemIds.length > 0 ||
        preferences.excludeKeywords.length > 0;
      const items = source.items.filter((item) => {
        if (!preferences.showHidden && preferences.hiddenItemIds.includes(item.id)) {
          return false;
        }

        if (preferences.excludeKeywords.length && matchesAnyKeyword(item, preferences.excludeKeywords)) {
          return false;
        }

        if (viewMode === "favorites" && !preferences.favoriteItemIds.includes(item.id)) {
          return false;
        }

        if (viewMode === "focus" && !matchesAnyKeyword(item, preferences.includeKeywords)) {
          return false;
        }

        return true;
      });

      return !isDerivedItemView && items.length === source.items.length
        ? source
        : withFilteredItems(source, items);
    })
    .filter((source) => source.items.length > 0);
}

function withFilteredItems(source: BoardSource, items: BoardSource["items"]): BoardSource {
  return {
    ...source,
    diagnostic: {
      ...source.diagnostic,
      itemCount: items.length
    },
    items
  };
}

function matchesAnyKeyword(item: BoardSource["items"][number], keywords: string[]) {
  if (!keywords.length) {
    return false;
  }

  const text = [item.title, item.summary, item.sourceName].join(" ").toLowerCase();

  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ");
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
  const sourceIdSet = new Set(defaultSourceIds);
  const sourceOrder = mergeSourceOrder(preferences.sourceOrder ?? [], defaultSourceIds);
  const subscribedSourceIds = (preferences.subscribedSourceIds?.length
    ? preferences.subscribedSourceIds
    : defaultSourceIds
  ).filter((sourceId) => sourceIdSet.has(sourceId));

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
    favorite: preferences.favoriteItemIds.length,
    hidden: preferences.hiddenItemIds.length,
    subscribed: preferences.subscribedSourceIds.length
  };
}

function getDefaultSourceIds(sources: BoardSource[]) {
  return sources
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((source) => source.id);
}

function orderSources(sources: BoardSource[], sourceOrder: string[]) {
  const order = mergeSourceOrder(sourceOrder, getDefaultSourceIds(sources));
  const orderIndex = new Map(order.map((sourceId, index) => [sourceId, index]));

  return sources
    .slice()
    .sort((a, b) => (orderIndex.get(a.id) ?? a.priority) - (orderIndex.get(b.id) ?? b.priority));
}

function mergeSourceOrder(order: string[], defaultSourceIds: string[]) {
  const defaultSet = new Set(defaultSourceIds);
  const cleanOrder = uniqueStrings(order).filter((sourceId) => defaultSet.has(sourceId));

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
