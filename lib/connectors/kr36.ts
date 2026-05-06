import { ensureItems, fetchText, normalizeText, SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const kr36Url = "https://36kr.com/newsflashes";

export const kr36Connector: SourceConnector = {
  id: "biz",
  label: "36Kr Newsflashes",
  async fetchItems() {
    try {
      const html = await fetchText(kr36Url);
      return ensureItems(extractWidgetItems(html), this.label);
    } catch {
      return fetchDailyHotItems("36kr", `${this.label} DailyHot`);
    }
  }
};

function extractWidgetItems(html: string) {
  const items: FetchedItem[] = [];
  const seen = new Set<string>();
  const pattern =
    /"itemId":(\d+)[\s\S]*?"templateMaterial":\{[\s\S]*?"widgetTitle":"((?:\\.|[^"\\])*)"[\s\S]*?"publishTime":(\d+)/g;

  for (const match of html.matchAll(pattern)) {
    if (items.length >= SOURCE_FETCH_LIMIT) {
      break;
    }

    const itemId = match[1];
    const title = normalizeText(JSON.parse(`"${match[2]}"`) as string);

    if (!itemId || !title || seen.has(itemId)) {
      continue;
    }

    seen.add(itemId);
    items.push({
      externalId: itemId,
      metric: items.length === 0 ? "新" : `${items.length + 1}`,
      publishedAt: new Date(Number(match[3])).toISOString(),
      raw: { itemId },
      summary: "36氪快讯",
      title,
      url: `https://36kr.com/p/${itemId}`
    });
  }

  return items;
}
