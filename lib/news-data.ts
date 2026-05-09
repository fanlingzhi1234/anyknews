import { categories, sourceCatalog } from "@/lib/sources/catalog";
import type {
  NewsCategory,
  SourceColor,
  SourceDisplayType,
  SourceManifest,
  SourceSeedItem
} from "@/lib/sources/types";

export type { NewsCategory, SourceColor, SourceDisplayType };

export type NewsItem = {
  title: string;
  summary: string;
  metric: string;
  url: string;
};

export type NewsSource = Omit<SourceManifest, "seedItems" | "connector"> & {
  catalogStatus: SourceManifest["catalogStatus"];
  items: NewsItem[];
};

export { categories };

export const catalogSources: NewsSource[] = sourceCatalog.map(toNewsSource);

export const sources: NewsSource[] = catalogSources.filter((source) => source.defaultSubscribed);

export const sourceHomeUrls = Object.fromEntries(
  sourceCatalog.map((source) => [source.id, source.homeUrl])
) as Record<string, string>;

function toNewsItem(item: SourceSeedItem): NewsItem {
  return {
    title: item.title,
    summary: item.summary ?? "",
    metric: item.metric ?? "",
    url: item.url ?? "#"
  };
}

function toNewsSource(source: SourceManifest): NewsSource {
  return {
    id: source.id,
    name: source.name,
    board: source.board,
    category: source.category,
    tone: source.tone,
    logo: source.logo,
    color: source.color,
    displayType: source.displayType,
    footer: source.footer,
    homeUrl: source.homeUrl,
    priority: source.priority,
    defaultSubscribed: source.defaultSubscribed,
    fetchCost: source.fetchCost,
    refreshPolicy: source.refreshPolicy,
    catalogStatus: source.catalogStatus,
    items: source.seedItems.map(toNewsItem)
  };
}
