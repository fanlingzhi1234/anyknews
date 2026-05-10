import {
  compactNumber,
  ensureItems,
  fetchJson,
  normalizeText,
  SOURCE_FETCH_LIMIT,
  stripHtml
} from "@/lib/connectors/shared";
import type { FetchedItem, SourceConnector } from "@/lib/connectors/types";

const sspaiHomeUrl = "https://sspai.com/";
const sspaiHotUrl =
  "https://sspai.com/api/v1/article/tag/page/get?limit=50&tag=%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0";

type SspaiArticle = {
  comment_count?: number;
  id?: number;
  like_count?: number;
  released_time?: number;
  summary?: string;
  title?: string;
};

type SspaiResponse = {
  data?: SspaiArticle[];
  error?: number;
  msg?: string;
};

export const sspaiConnector: SourceConnector = {
  id: "sspai",
  label: "少数派",
  async fetchItems() {
    const payload = await fetchJson<SspaiResponse>(sspaiHotUrl, {
      Referer: sspaiHomeUrl
    });

    if (payload.error && payload.error !== 0) {
      throw new Error(payload.msg || "少数派 API returned an error");
    }

    return ensureItems(normalizeSspaiArticles(payload.data ?? []), this.label);
  }
};

function normalizeSspaiArticles(articles: SspaiArticle[]) {
  return articles
    .slice(0, SOURCE_FETCH_LIMIT)
    .map<FetchedItem | undefined>((article, index) => {
      const title = normalizeText(article.title ?? "");
      const id = article.id;

      if (!title || !id) {
        return undefined;
      }

      const likeText = compactNumber(article.like_count);
      const commentText = compactNumber(article.comment_count);

      return {
        externalId: `sspai-${id}`,
        metric: likeText || commentText || (index === 0 ? "新" : `${index + 1}`),
        publishedAt: normalizeSspaiTimestamp(article.released_time),
        raw: article,
        summary: stripHtml(article.summary ?? ""),
        title,
        url: new URL(`/post/${id}`, sspaiHomeUrl).toString()
      };
    })
    .filter((item): item is FetchedItem => Boolean(item));
}

function normalizeSspaiTimestamp(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return undefined;
  }

  const milliseconds = timestamp > 1000000000000 ? timestamp : timestamp * 1000;

  return new Date(milliseconds).toISOString();
}
