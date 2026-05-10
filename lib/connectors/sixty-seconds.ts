import {
  compactNumber,
  ensureItems,
  fetchJson,
  normalizeText,
  SOURCE_FETCH_LIMIT,
  stripHtml
} from "@/lib/connectors/shared";
import type { FetchedItem } from "@/lib/connectors/types";

type SixtySecondsItem = {
  desc?: string;
  description?: string;
  event_time?: string;
  hot_value?: number | string;
  id?: number | string;
  link?: string;
  rank?: number | string;
  score?: number | string;
  score_desc?: string;
  summary?: string;
  title?: string;
  type_desc?: string;
  url?: string;
  word_type?: string;
};

type SixtySecondsResponse = {
  code?: number | string;
  data?: SixtySecondsItem[] | { list?: SixtySecondsItem[] };
  message?: string;
};

const defaultBaseUrls = [
  "https://60s.viki.moe"
];

export async function fetchSixtySecondsItems(endpoint: string, label: string) {
  let lastError: unknown;

  for (const url of getSixtySecondsUrls(endpoint)) {
    try {
      const payload = await fetchJson<SixtySecondsResponse>(url);
      const code = payload.code ? Number(payload.code) : 200;

      if (code >= 400) {
        throw new Error(payload.message ?? `${label} 60s API failed`);
      }

      return ensureItems(mapSixtySecondsItems(payload, endpoint, url), label);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`${label} 60s API exhausted all routes`);
}

function mapSixtySecondsItems(payload: SixtySecondsResponse, endpoint: string, sourceUrl: string) {
  const rawItems = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.data?.list)
      ? payload.data.list
      : [];

  return rawItems
    .slice(0, SOURCE_FETCH_LIMIT)
    .map((item, index): FetchedItem => {
      const title = normalizeText(item.title ?? "");
      const url = normalizeText(item.link ?? item.url ?? sourceUrl);
      const metric = normalizeMetric(item, index);

      return {
        externalId: `${endpoint}-${item.id ?? item.rank ?? index + 1}-${title}`,
        metric,
        publishedAt: normalizePublishedAt(item.event_time),
        raw: { provider: "60s", route: endpoint },
        summary: stripHtml(item.summary ?? item.desc ?? item.description ?? payload.message ?? "60s API 公开热榜"),
        title,
        url
      };
    })
    .filter((item) => item.title && item.url);
}

function normalizeMetric(item: SixtySecondsItem, index: number) {
  if (item.score_desc) {
    return normalizeText(item.score_desc);
  }

  if (typeof item.hot_value === "number") {
    return compactNumber(item.hot_value);
  }

  if (typeof item.score === "number") {
    return compactNumber(item.score);
  }

  const textMetric = normalizeText(
    String(item.hot_value ?? item.score ?? item.word_type ?? item.type_desc ?? "")
  );

  return textMetric || (index === 0 ? "新" : `${index + 1}`);
}

function normalizePublishedAt(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.replace(/\//g, "-");
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getSixtySecondsUrls(endpoint: string) {
  const baseUrls = (process.env.ANYKNEWS_SIXTY_SECONDS_BASE_URLS ?? defaultBaseUrls.join(","))
    .split(",")
    .map((baseUrl) => baseUrl.trim())
    .filter(Boolean);

  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/v2/${endpoint}`;

  return baseUrls.map((baseUrl) =>
    new URL(normalizedEndpoint, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
  );
}
