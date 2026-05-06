import { load } from "cheerio";
import type { FetchedItem } from "@/lib/connectors/types";

type FetchInit = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

const defaultHeaders = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
};

export const SOURCE_FETCH_LIMIT = 50;

export async function fetchText(
  url: string,
  options: {
    encoding?: string;
    headers?: HeadersInit;
    timeoutMs?: number;
  } = {}
) {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 12000);
  const response = await fetch(url, {
    headers: {
      ...defaultHeaders,
      ...options.headers
    },
    next: { revalidate: 0 },
    signal
  } as FetchInit);

  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder(options.encoding ?? "utf-8").decode(buffer);
}

export async function fetchJson<T>(url: string, headers?: HeadersInit) {
  const response = await fetch(url, {
    headers: {
      ...defaultHeaders,
      Accept: "application/json,text/plain,*/*",
      ...headers
    },
    next: { revalidate: 0 }
  } as FetchInit);

  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getCookieEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function getRssHubRoute(route: string) {
  const baseUrl = process.env.RSSHUB_BASE_URL?.trim();

  if (!baseUrl) {
    return undefined;
  }

  return new URL(route, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function getPublicRssHubRoute(route: string) {
  return getPublicRssHubRoutes(route)[0];
}

export function getPublicRssHubRoutes(route: string) {
  if (process.env.ANYKNEWS_DISABLE_PUBLIC_RSSHUB === "true") {
    return [];
  }

  const baseUrls = (process.env.ANYKNEWS_PUBLIC_RSSHUB_BASE_URLS ?? process.env.ANYKNEWS_PUBLIC_RSSHUB_BASE_URL ?? "https://rsshub.app,https://rsshub.rssforever.com")
    .split(",")
    .map((baseUrl) => baseUrl.trim())
    .filter(Boolean);

  return baseUrls.map((baseUrl) =>
    new URL(route, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
  );
}

export function parseRssItems(xml: string, sourceUrl: string, limit = SOURCE_FETCH_LIMIT) {
  const $ = load(xml, { xmlMode: true });
  const items: FetchedItem[] = [];

  $("item").each((index, element) => {
    if (items.length >= limit) {
      return false;
    }

    const item = $(element);
    const title = normalizeText(item.find("title").first().text());
    const link = normalizeText(item.find("link").first().text());

    if (!title || !link) {
      return;
    }

    const description = stripHtml(item.find("description").first().text());
    const pubDate = normalizeText(item.find("pubDate").first().text());
    const guid = normalizeText(item.find("guid").first().text()) || link;

    items.push({
      externalId: guid,
      metric: index === 0 ? "新" : `${index + 1}`,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
      raw: { source: sourceUrl },
      summary: description,
      title,
      url: link
    });
  });

  return items;
}

export function extractLinksFromHtml(
  html: string,
  options: {
    baseUrl: string;
    hrefIncludes: string[];
    limit?: number;
    minTitleLength?: number;
  }
) {
  const $ = load(html);
  const seen = new Set<string>();
  const items: FetchedItem[] = [];
  const limit = options.limit ?? SOURCE_FETCH_LIMIT;
  const minTitleLength = options.minTitleLength ?? 8;

  $("a").each((index, element) => {
    if (items.length >= limit) {
      return false;
    }

    const linkElement = $(element);
    const href = linkElement.attr("href") ?? "";
    const title = normalizeText(linkElement.attr("title") ?? linkElement.text());

    if (title.length < minTitleLength || !matchesHref(href, options.hrefIncludes)) {
      return;
    }

    const url = toAbsoluteUrl(href, options.baseUrl);
    const key = `${title}\n${url}`;

    if (seen.has(key) || isNavigationTitle(title)) {
      return;
    }

    seen.add(key);
    items.push({
      externalId: href,
      metric: index === 0 ? "新" : `${items.length + 1}`,
      raw: { href },
      summary: summarizeContainerText($, element, title),
      title,
      url
    });
  });

  return items;
}

export function normalizeText(value: string) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

export function stripHtml(value: string) {
  return normalizeText(load(value).text() || value);
}

export function compactNumber(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return "";
  }

  if (value >= 10000) {
    return `${Math.round(value / 10000)}万`;
  }

  return String(value);
}

export function ensureItems(items: FetchedItem[], label: string) {
  if (!items.length) {
    throw new Error(`${label} connector returned no items`);
  }

  return items;
}

function matchesHref(href: string, includes: string[]) {
  return includes.some((pattern) => href.includes(pattern));
}

function toAbsoluteUrl(href: string, baseUrl: string) {
  return new URL(href, baseUrl).toString();
}

function summarizeContainerText(
  $: ReturnType<typeof load>,
  element: Parameters<ReturnType<typeof load>>[0],
  title: string
) {
  const text = normalizeText(
    $(element)
      .closest("li, article, div")
      .text()
      .replace(title, "")
  );

  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function isNavigationTitle(title: string) {
  return [
    "首页",
    "登录",
    "注册",
    "更多",
    "联系我们",
    "关于我们",
    "广告合作"
  ].includes(title);
}

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
