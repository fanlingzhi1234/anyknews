import {
  ensureItems,
  extractLinksFromHtml,
  fetchJson,
  fetchText,
  normalizeText,
  SOURCE_FETCH_LIMIT
} from "@/lib/connectors/shared";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const eastmoneyHomeUrl = "https://www.eastmoney.com/";
const fastNewsUrl =
  "https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_news_col&fastColumn=102&sortEndTime=0&pageSize=50";

type EastmoneyFastNews = {
  code?: string;
  digest?: string;
  id?: string | number;
  newsId?: string | number;
  showTime?: string;
  title?: string;
  url?: string;
};

type EastmoneyResponse = {
  data?: {
    fastNewsList?: EastmoneyFastNews[];
  };
};

export const eastmoneyConnector: SourceConnector = {
  id: "eastmoney",
  label: "东方财富",
  async fetchItems() {
    try {
      const payload = await fetchJson<EastmoneyResponse>(fastNewsUrl, {
        Referer: eastmoneyHomeUrl
      });

      return ensureItems(normalizeFastNews(payload.data?.fastNewsList ?? []), this.label);
    } catch {
      const html = await fetchText(eastmoneyHomeUrl);
      return ensureItems(extractEastmoneyLinks(html), this.label);
    }
  }
};

function normalizeFastNews(news: EastmoneyFastNews[]) {
  return news
    .slice(0, SOURCE_FETCH_LIMIT)
    .map<FetchedItem | undefined>((item, index) => {
      const title = normalizeText(item.title ?? "");

      if (!title) {
        return undefined;
      }

      return {
        externalId: String(item.code ?? item.newsId ?? item.id ?? `${title}-${index}`),
        metric: index === 0 ? "新" : `${index + 1}`,
        publishedAt: parseDate(item.showTime),
        raw: item,
        summary: normalizeText(item.digest ?? ""),
        title,
        url: item.url || eastmoneyHomeUrl
      };
    })
    .filter((item): item is FetchedItem => Boolean(item));
}

function extractEastmoneyLinks(html: string) {
  return extractLinksFromHtml(html, {
    baseUrl: eastmoneyHomeUrl,
    hrefIncludes: ["/a/"],
    limit: SOURCE_FETCH_LIMIT,
    minTitleLength: 8
  });
}

function parseDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
