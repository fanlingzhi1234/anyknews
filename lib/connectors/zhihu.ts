import {
  ensureItems,
  fetchJson,
  fetchText,
  getCookieEnv,
  getRssHubRoute,
  parseRssItems,
  SOURCE_FETCH_LIMIT,
  stripHtml
} from "@/lib/connectors/shared";
import { fetchDailyHotItems } from "@/lib/connectors/dailyhot";
import type { SourceConnector } from "@/lib/connectors/types";

const zhihuHotUrl =
  `https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=${SOURCE_FETCH_LIMIT}&desktop=true`;
const zhihuPublicHotUrl = `https://api.zhihu.com/topstory/hot-lists/total?limit=${SOURCE_FETCH_LIMIT}`;

type ZhihuHotResponse = {
  data?: Array<{
    detail_text?: string;
    target?: {
      excerpt?: string;
      id?: number;
      title?: string;
      url?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export const zhihuConnector: SourceConnector = {
  id: "general",
  label: "Zhihu Hot List",
  async fetchItems() {
    const cookie = getCookieEnv("ZHIHU_COOKIE", "ZHIHU_COOKIES");
    const rssHubUrl = getRssHubRoute("/zhihu/hot");

    try {
      const publicPayload = await fetchJson<ZhihuHotResponse>(
        zhihuPublicHotUrl,
        cookie ? { Cookie: cookie } : undefined
      );
      const publicItems = normalizeZhihuItems(publicPayload, this.label);

      if (publicItems.length) {
        return publicItems;
      }
    } catch {
      // Fall through to RSSHub or the authenticated web endpoint.
    }

    try {
      return await fetchDailyHotItems("zhihu", `${this.label} DailyHot`);
    } catch {
      // Keep going through the configured private fallbacks.
    }

    if (rssHubUrl) {
      const xml = await fetchText(rssHubUrl);
      return ensureItems(parseRssItems(xml, rssHubUrl), this.label);
    }

    if (cookie) {
      const payload = await fetchJson<ZhihuHotResponse>(zhihuHotUrl, {
        Cookie: cookie,
        Referer: "https://www.zhihu.com/hot"
      });

      return normalizeZhihuItems(payload, this.label);
    }

    throw new Error("Zhihu public API returned no items. Set ZHIHU_COOKIE or RSSHUB_BASE_URL.");
  }
};

function normalizeZhihuItems(payload: ZhihuHotResponse, label: string) {
  if (payload.error) {
    throw new Error(payload.error.message ?? "Zhihu API requires authentication");
  }

  return ensureItems(
    (payload.data ?? [])
      .slice(0, SOURCE_FETCH_LIMIT)
      .map((item, index) => {
        const target = item.target;
        const id = target?.id ? String(target.id) : String(index + 1);
        const url = normalizeQuestionUrl(target?.url, id);

        return {
          externalId: id,
          metric: item.detail_text ?? `${index + 1}`,
          raw: item,
          summary: stripHtml(target?.excerpt ?? ""),
          title: target?.title ?? "",
          url
        };
      })
      .filter((item) => item.title),
    label
  );
}

function normalizeQuestionUrl(url: string | undefined, id: string) {
  if (!url) {
    return `https://www.zhihu.com/question/${id}`;
  }

  return url
    .replace("https://api.zhihu.com/questions/", "https://www.zhihu.com/question/")
    .replace("https://api.zhihu.com/question/", "https://www.zhihu.com/question/");
}
