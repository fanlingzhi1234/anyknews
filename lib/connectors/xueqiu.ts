import {
  ensureItems,
  fetchJson,
  fetchText,
  getCookieEnv,
  getPublicRssHubRoutes,
  getRssHubRoute,
  parseRssItems,
  SOURCE_FETCH_LIMIT
} from "@/lib/connectors/shared";
import type { SourceConnector } from "@/lib/connectors/types";

const xueqiuHotSpotUrl = "https://xueqiu.com/hot/spot";
const xueqiuHotTopicUrl =
  `https://xueqiu.com/query/v1/hot_event/tag.json?since_id=-1&size=${SOURCE_FETCH_LIMIT}`;

type XueqiuHotTopicResponse = {
  code?: number;
  data?: Array<{
    content?: string;
    id?: number;
    reason?: string;
    statusCount?: number;
    stocks?: Array<{
      name?: string;
      percentage?: number;
    }>;
    title?: string;
    url?: string;
  }>;
  error_description?: string;
};

export const xueqiuConnector: SourceConnector = {
  id: "finance",
  label: "Xueqiu Hot Topics",
  async fetchItems() {
    const configuredCookie = getCookieEnv("XUEQIU_COOKIE", "XUEQIU_COOKIES");
    const anonymousCookie = configuredCookie ? undefined : await getAnonymousXueqiuCookie();
    const cookie = configuredCookie ?? anonymousCookie;

    if (cookie) {
      try {
        const payload = await fetchJson<XueqiuHotTopicResponse>(xueqiuHotTopicUrl, {
          Cookie: cookie,
          Referer: xueqiuHotSpotUrl
        });

        if (payload.error_description) {
          throw new Error(payload.error_description);
        }

        return normalizeHotTopics(payload, this.label);
      } catch {
        // Fall through to RSSHub mirrors; the first-party endpoint can reject cookies.
      }
    }

    const rssHubUrls = [
      getRssHubRoute("/xueqiu/today"),
      ...getPublicRssHubRoutes("/xueqiu/today")
    ].filter(Boolean) as string[];
    let rssHubError: string | undefined;

    for (const rssHubUrl of rssHubUrls) {
      try {
        const xml = await fetchText(rssHubUrl, { timeoutMs: 3000 });
        return ensureItems(parseRssItems(xml, rssHubUrl), this.label);
      } catch (error) {
        rssHubError = error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error(rssHubError ?? "Xueqiu hot topics require XUEQIU_COOKIE or RSSHub.");
  }
};

async function getAnonymousXueqiuCookie() {
  const response = await fetch(xueqiuHotSpotUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    },
    next: { revalidate: 0 }
  } as RequestInit & { next?: { revalidate?: number } });

  if (!response.ok) {
    return undefined;
  }

  return getSetCookieValues(response.headers)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function normalizeHotTopics(payload: XueqiuHotTopicResponse, label: string) {
  return ensureItems(
    (payload.data ?? []).slice(0, SOURCE_FETCH_LIMIT).map((item, index) => ({
      externalId: item.id ? String(item.id) : `${index + 1}`,
      metric: item.reason ?? (typeof item.statusCount === "number" ? `${item.statusCount} 讨论` : `${index + 1}`),
      raw: item,
      summary: [
        item.content,
        item.stocks?.slice(0, 2).map((stock) =>
          stock.name
            ? `${stock.name}${typeof stock.percentage === "number" ? ` ${stock.percentage.toFixed(2)}%` : ""}`
            : ""
        ).filter(Boolean).join(" · ")
      ].filter(Boolean).join(" · "),
      title: item.title ?? "",
      url: item.url ?? xueqiuHotSpotUrl
    })).filter((item) => item.title),
    label
  );
}

function getSetCookieValues(headers: Headers) {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (withGetSetCookie.getSetCookie) {
    return withGetSetCookie.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    return [];
  }

  return setCookie.split(/,(?=\s*[^;,\s]+=)/g);
}
