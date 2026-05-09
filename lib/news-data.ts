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
  connector: SourceManifest["connector"];
  items: NewsItem[];
};

export { categories };

export const sources: NewsSource[] = sourceCatalog.map(({ seedItems, ...source }) => ({
  ...source,
  items: seedItems.map(toNewsItem)
}));

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
