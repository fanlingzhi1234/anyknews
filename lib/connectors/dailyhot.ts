import {
  compactNumber,
  ensureItems,
  fetchJson,
  normalizeText,
  SOURCE_FETCH_LIMIT,
  stripHtml
} from "@/lib/connectors/shared";
import type { FetchedItem } from "@/lib/connectors/types";

type DailyHotItem = {
  desc?: string;
  hot?: number | string;
  id?: number | string;
  mobileUrl?: string;
  timestamp?: number | string;
  title?: string;
  url?: string;
};

type DailyHotResponse = {
  code?: number | string;
  data?: DailyHotItem[];
  message?: string;
  msg?: string;
  title?: string;
};

const defaultDailyHotBaseUrl = "https://dailyhot.imsyy.top";

export async function fetchDailyHotItems(endpoint: string, label: string) {
  const url = getDailyHotUrl(endpoint);
  const payload = await fetchJson<DailyHotResponse>(url);
  const code = payload.code ? Number(payload.code) : 200;

  if (code >= 400) {
    throw new Error(payload.message ?? payload.msg ?? `${label} DailyHot fallback failed`);
  }

  return ensureItems(
    (payload.data ?? [])
      .slice(0, SOURCE_FETCH_LIMIT)
      .map((item, index): FetchedItem => {
        const id = item.id ? String(item.id) : `${endpoint}-${index + 1}`;
        const hot =
          typeof item.hot === "number" ? compactNumber(item.hot) : normalizeText(String(item.hot ?? ""));

        return {
          externalId: `${endpoint}-${id}`,
          metric: hot || (index === 0 ? "新" : `${index + 1}`),
          publishedAt: normalizeDailyHotTimestamp(item.timestamp),
          raw: { provider: "DailyHotApi", route: endpoint },
          summary: stripHtml(item.desc ?? payload.title ?? "DailyHotApi 公开热榜兜底"),
          title: normalizeText(item.title ?? ""),
          url: item.url ?? item.mobileUrl ?? defaultDailyHotBaseUrl
        };
      })
      .filter((item) => item.title && item.url),
    label
  );
}

function getDailyHotUrl(endpoint: string) {
  const baseUrl =
    process.env.DAILYHOT_API_BASE_URL?.trim() ||
    process.env.ANYKNEWS_DAILYHOT_BASE_URL?.trim() ||
    defaultDailyHotBaseUrl;

  return new URL(endpoint, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function normalizeDailyHotTimestamp(timestamp: DailyHotItem["timestamp"]) {
  if (!timestamp) {
    return undefined;
  }

  const numericTimestamp = Number(timestamp);

  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return undefined;
  }

  const milliseconds = numericTimestamp > 1000000000000 ? numericTimestamp : numericTimestamp * 1000;

  return new Date(milliseconds).toISOString();
}
