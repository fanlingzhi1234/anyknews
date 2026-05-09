import { ensureItems, fetchJson, SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const topStoriesUrl = "https://hacker-news.firebaseio.com/v0/topstories.json";
const itemUrl = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const hnItemUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

type HnItem = {
  by?: string;
  id: number;
  score?: number;
  time?: number;
  title?: string;
  url?: string;
};

export const hackerNewsConnector: SourceConnector = {
  id: "hacker-news",
  label: "Hacker News",
  async fetchItems() {
    const ids = await fetchJson<number[]>(topStoriesUrl);
    const topIds = ids.slice(0, SOURCE_FETCH_LIMIT);
    const items = await Promise.all(topIds.map((id) => fetchJson<HnItem>(itemUrl(id))));

    return ensureItems(normalizeHnItems(items), this.label);
  }
};

function normalizeHnItems(items: HnItem[]) {
  return items
    .filter((item) => item.title)
    .map<FetchedItem>((item, index) => ({
      externalId: String(item.id),
      metric: typeof item.score === "number" ? String(item.score) : `${index + 1}`,
      publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
      raw: item,
      summary: formatSummary(item),
      title: item.title ?? "Untitled",
      url: item.url ?? hnItemUrl(item.id)
    }));
}

function formatSummary(item: HnItem) {
  return [
    item.by ? `by ${item.by}` : undefined,
    typeof item.score === "number" ? `${item.score} points` : undefined
  ].filter(Boolean).join(" · ") || undefined;
}
