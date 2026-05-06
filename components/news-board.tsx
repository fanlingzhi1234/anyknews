"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ExternalLink,
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
const PREFERENCES_STORAGE_KEY = "anyknews.preferences.v1";
const TREND_SNAPSHOT_STORAGE_KEY = "anyknews.trend-snapshot.v1";

type ViewMode = "all" | "unread" | "favorites" | "focus";

type LocalPreferences = {
  favoriteItemIds: string[];
  hiddenItemIds: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  readItemIds: string[];
  showHidden: boolean;
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
  readItemIds: [],
  showHidden: false
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
  const [activeCategory, setActiveCategory] = useState(categories[0]?.anchor ?? "");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [preferences, setPreferences] = useState<LocalPreferences>(loadLocalPreferences);
  const [trendChanges, setTrendChanges] = useState<TrendChange[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const statusStats = getStatusStats(board);
  const personalizedSources = useMemo(
    () => applyPreferences(board.sources, preferences, viewMode),
    [board.sources, preferences, viewMode]
  );
  const filteredSources = useMemo(
    () => filterBoardSources(personalizedSources, searchQuery),
    [personalizedSources, searchQuery]
  );
  const visibleItemCount = filteredSources.reduce(
    (count, source) => count + source.items.length,
    0
  );
  const preferenceCounts = useMemo(() => getPreferenceCounts(preferences), [preferences]);
  const trendInsights = useMemo(
    () => buildTrendInsights(applyPreferences(board.sources, preferences, "all")),
    [board.sources, preferences]
  );
  const eventClusters = useMemo(
    () => buildEventClusters(applyPreferences(board.sources, preferences, "all")),
    [board.sources, preferences]
  );
  const diagnostics = useMemo(() => buildDiagnostics(board), [board]);
  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

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
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".sourceCard"));

    if (!cards.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const nextCategory = visibleEntry?.target.getAttribute("data-category-key");

        if (nextCategory) {
          setActiveCategory(nextCategory);
        }
      },
      {
        rootMargin: "-96px 0px -58% 0px",
        threshold: [0.18, 0.35, 0.55]
      }
    );

    cards.forEach((card) => observer.observe(card));

    return () => observer.disconnect();
  }, [filteredSources]);

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

  function togglePreferenceList(listKey: "favoriteItemIds" | "hiddenItemIds" | "readItemIds", itemId: string) {
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

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AnyKnews 首页">
          <span className="brandMark">A</span>
          <span>AnyKnews</span>
        </a>
        <nav className="nav" aria-label="分类">
          {categories.map((category) => (
            <a
              aria-current={activeCategory === category.anchor ? "page" : undefined}
              className={activeCategory === category.anchor ? "navActive" : undefined}
              href={`#${category.anchor}`}
              key={category.anchor}
              onClick={() => setActiveCategory(category.anchor)}
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
            aria-label="手动刷新"
            disabled={isLoading}
            onClick={() => void loadBoard(true)}
            type="button"
          >
            <RefreshCcw className={isLoading ? "spin" : ""} size={18} strokeWidth={2.4} />
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
                : `${board.sourceCount} 个来源 · ${statusStats.error} 个兜底 · 按分类顺序连续填充`}
            </span>
          </div>
          <div>打开时更新 · 手动刷新 · AI日报 10:00</div>
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
              ["all", "全部"],
              ["unread", "未读"],
              ["favorites", `收藏 ${preferenceCounts.favorite}`],
              ["focus", `关注词 ${preferences.includeKeywords.length}`]
            ].map(([mode, label]) => (
              <button
                aria-pressed={viewMode === mode}
                className={viewMode === mode ? "active" : ""}
                key={mode}
                onClick={() => setViewMode(mode as ViewMode)}
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
              aria-expanded={isSettingsOpen}
              className={isSettingsOpen ? "active" : ""}
              onClick={() => setIsSettingsOpen((current) => !current)}
              type="button"
            >
              <SlidersHorizontal size={15} strokeWidth={2.2} />
              规则
            </button>
          </div>
        </section>
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
                isRefreshing={refreshingSourceId === source.id}
                key={source.id}
                onMarkRead={(itemId) => togglePreferenceList("readItemIds", itemId)}
                onRefresh={refreshSource}
                onToggleFavorite={(itemId) => togglePreferenceList("favoriteItemIds", itemId)}
                onToggleHidden={(itemId) => togglePreferenceList("hiddenItemIds", itemId)}
                preferences={preferences}
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
  isRefreshing,
  onMarkRead,
  onRefresh,
  onToggleFavorite,
  onToggleHidden,
  preferences,
  source
}: {
  isRefreshing: boolean;
  onMarkRead: (itemId: string) => void;
  onRefresh: (sourceId: string) => Promise<void>;
  onToggleFavorite: (itemId: string) => void;
  onToggleHidden: (itemId: string) => void;
  preferences: LocalPreferences;
  source: BoardSource;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(source.items.length / CARD_ITEMS_PER_PAGE));
  const pageStart = currentPage * CARD_ITEMS_PER_PAGE;
  const pageItems = source.items.slice(pageStart, pageStart + CARD_ITEMS_PER_PAGE);
  const canPage = source.items.length > CARD_ITEMS_PER_PAGE;

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages - 1));
  }, [source.id, totalPages]);

  return (
    <article
      className={`sourceCard category-${source.categoryKey} ${source.status === "error" ? "sourceCard-error" : ""}`}
      aria-busy={isRefreshing}
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
            const isFavorite = preferences.favoriteItemIds.includes(item.id);
            const isHidden = preferences.hiddenItemIds.includes(item.id);
            const isRead = preferences.readItemIds.includes(item.id);
            const isFocus = matchesAnyKeyword(item, preferences.includeKeywords);

            return (
            <li
              className={`newsItem ${isRead ? "newsItem-read" : ""} ${isFavorite ? "newsItem-favorite" : ""} ${isHidden ? "newsItem-hidden" : ""} ${isFocus ? "newsItem-focus" : ""}`}
              key={item.id}
            >
              <span className={`rank ${rank <= 3 ? `rank-${rank}` : ""}`}>
                {rank}
              </span>
              <a
                className="itemMain"
                href={item.url}
                onClick={() => onMarkRead(item.id)}
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
                    aria-pressed={isRead}
                    aria-label={isRead ? "标记未读" : "标记已读"}
                    onClick={() => onMarkRead(item.id)}
                    title={isRead ? "标记未读" : "标记已读"}
                    type="button"
                  >
                    <Check size={14} strokeWidth={2.4} />
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
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
              type="button"
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <span>
              {currentPage + 1}/{totalPages}
            </span>
            <button
              aria-label="下一页"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}
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

function getStatusStats(board: BoardPayload) {
  const error = board.sources.filter((source) => source.status === "error").length;

  return {
    error,
    ok: board.sources.length - error
  };
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

      return {
        ...source,
        items
      };
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
  return sources
    .map((source) => {
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

        if (viewMode === "unread" && preferences.readItemIds.includes(item.id)) {
          return false;
        }

        if (viewMode === "focus" && !matchesAnyKeyword(item, preferences.includeKeywords)) {
          return false;
        }

        return true;
      });

      return {
        ...source,
        items
      };
    })
    .filter((source) => source.items.length > 0);
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

function loadLocalPreferences(): LocalPreferences {
  if (typeof window === "undefined") {
    return defaultPreferences;
  }

  try {
    const storedPreferences = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);

    if (!storedPreferences) {
      return defaultPreferences;
    }

    const parsed = JSON.parse(storedPreferences) as Partial<LocalPreferences>;

    return {
      favoriteItemIds: Array.isArray(parsed.favoriteItemIds) ? parsed.favoriteItemIds : [],
      hiddenItemIds: Array.isArray(parsed.hiddenItemIds) ? parsed.hiddenItemIds : [],
      includeKeywords: Array.isArray(parsed.includeKeywords)
        ? parsed.includeKeywords
        : defaultPreferences.includeKeywords,
      excludeKeywords: Array.isArray(parsed.excludeKeywords) ? parsed.excludeKeywords : [],
      readItemIds: Array.isArray(parsed.readItemIds) ? parsed.readItemIds : [],
      showHidden: Boolean(parsed.showHidden)
    };
  } catch {
    return defaultPreferences;
  }
}

function getPreferenceCounts(preferences: LocalPreferences) {
  return {
    favorite: preferences.favoriteItemIds.length,
    hidden: preferences.hiddenItemIds.length,
    read: preferences.readItemIds.length
  };
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
