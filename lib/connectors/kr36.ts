import { ensureItems, fetchText, normalizeText, SOURCE_FETCH_LIMIT } from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const kr36Url = "https://36kr.com/information/web_recommend/";

export const kr36Connector: SourceConnector = {
  id: "biz",
  label: "36Kr Web Recommend",
  async fetchItems() {
    try {
      const html = await fetchText(kr36Url);
      return ensureItems(extractInitialStateItems(html), this.label);
    } catch {
      return fetchDailyHotItems("36kr", `${this.label} DailyHot`);
    }
  }
};

type Kr36InitialState = {
  information?: {
    informationList?: {
      itemList?: Kr36RawItem[];
    };
  };
};

type Kr36RawItem = {
  itemId?: number;
  route?: string;
  templateMaterial?: {
    authorName?: string;
    publishTime?: number;
    summary?: string;
    widgetTitle?: string;
  };
};

function extractInitialStateItems(html: string) {
  const initialState = parseInitialState(html);

  if (initialState) {
    const items = initialState.information?.informationList?.itemList ?? [];
    return extractWidgetItems(items);
  }

  return extractWidgetItemsFromHtml(html);
}

function parseInitialState(html: string) {
  const match = html.match(/window\.initialState=(\{[\s\S]*?\})<\/script>/);

  if (!match?.[1]) {
    return undefined;
  }

  return JSON.parse(match[1]) as Kr36InitialState;
}

function extractWidgetItems(items: Kr36RawItem[]) {
  const fetchedItems: FetchedItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (fetchedItems.length >= SOURCE_FETCH_LIMIT) {
      break;
    }

    const itemId = item.itemId ? String(item.itemId) : "";
    const material = item.templateMaterial;
    const title = normalizeText(material?.widgetTitle ?? "");

    if (!itemId || !title || seen.has(itemId)) {
      continue;
    }

    seen.add(itemId);
    fetchedItems.push({
      externalId: itemId,
      metric: fetchedItems.length === 0 ? "新" : `${fetchedItems.length + 1}`,
      publishedAt: material?.publishTime ? new Date(material.publishTime).toISOString() : undefined,
      raw: { itemId, route: item.route },
      summary: normalizeText(material?.summary ?? material?.authorName ?? "36氪资讯推荐"),
      title,
      url: `https://36kr.com/p/${itemId}`
    });
  }

  return fetchedItems;
}

function extractWidgetItemsFromHtml(html: string) {
  const items: FetchedItem[] = [];
  const seen = new Set<string>();
  const pattern =
    /"itemId":(\d+)[\s\S]*?"templateMaterial":\{[\s\S]*?"publishTime":(\d+)[\s\S]*?"widgetTitle":"((?:\\.|[^"\\])*)"(?:[\s\S]*?"summary":"((?:\\.|[^"\\])*)")?/g;

  for (const match of html.matchAll(pattern)) {
    if (items.length >= SOURCE_FETCH_LIMIT) {
      break;
    }

    const itemId = match[1];
    const title = normalizeText(JSON.parse(`"${match[3]}"`) as string);
    const summary = match[4] ? normalizeText(JSON.parse(`"${match[4]}"`) as string) : "36氪资讯推荐";

    if (!itemId || !title || seen.has(itemId)) {
      continue;
    }

    seen.add(itemId);
    items.push({
      externalId: itemId,
      metric: items.length === 0 ? "新" : `${items.length + 1}`,
      publishedAt: new Date(Number(match[2])).toISOString(),
      raw: { itemId },
      summary,
      title,
      url: `https://36kr.com/p/${itemId}`
    });
  }

  return items;
}
